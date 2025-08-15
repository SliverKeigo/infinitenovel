import logger from "@/lib/logger";
import { z } from "zod";
import { ModelConfig } from "@/types/ai";
import { getChatCompletion } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import {
  addElementsToCollection,
  upsertElementsInCollection,
} from "../vector-store";
import { DetailedOutlineBatch } from "./outline";
import { safelyParseJson } from "../utils/json";
import { readStreamToString } from "../utils/stream";
import {
  ENTITY_IDENTIFICATION_PROMPT,
  INITIAL_WORLD_BUILD_PROMPT,
  WORLD_FUSION_PROMPT,
} from "@/lib/prompts/world.prompts";
import { interpolatePrompt } from "@/lib/utils/prompt";

// 用于验证 AI 生成的世界观元素的 Zod 模式
const worldElementSchema = z.object({
  name: z.string(),
  description: z.string(),
});

const initialWorldBuildSchema = z.object({
  roles: z.array(worldElementSchema),
  scenes: z.array(worldElementSchema),
  clues: z.array(worldElementSchema),
});

// 导出类型供外部使用
export type InitialWorldBuild = z.infer<typeof initialWorldBuildSchema>;

const entityIdentificationSchema = z.object({
  roles: z.array(z.string()).default([]),
  scenes: z.array(z.string()).default([]),
  clues: z.array(z.string()).default([]),
});

export type IdentifiedEntities = z.infer<typeof entityIdentificationSchema>;

/**
 * 根据小说的主要大纲和第一批详细的章节大纲，生成初始的核心角色、场景和线索。
 *
 * @param mainOutline - 故事的高层大纲。
 * @param detailedOutline - 第一批详细的章节大纲。
 * @param generationConfig - AI 模型配置。
 * @returns 返回一个包含初始角色、场景和线索的结构化对象。
 */
export async function generateInitialWorldElements(
  mainOutline: string,
  detailedOutline: DetailedOutlineBatch,
  generationConfig: ModelConfig,
  retries = 30,
): Promise<InitialWorldBuild> {
  const worldBuildingPrompt = interpolatePrompt(INITIAL_WORLD_BUILD_PROMPT, {
    mainOutline,
    detailedOutlineJson: JSON.stringify(detailedOutline, null, 2),
  });

  for (let i = 0; i < retries; i++) {
    try {
      logger.info(`正在生成初始世界设定 (尝试次数 ${i + 1})...`);
      const responseStream = await getChatCompletion(
        "生成初始世界设定",
        generationConfig,
        worldBuildingPrompt,
        {
          stream: true,
          response_format: { type: "json_object" },
        },
      );

      if (!responseStream) {
        throw new Error("AI 服务未能成功生成初始世界设定。");
      }

      const response = await readStreamToString(responseStream);
      logger.debug(`[AI 原始响应] 世界设定生成: ${response}`);

      if (!response) {
        throw new Error("从 AI 流中未能读取到任何内容。");
      }

      const parsedResponse = safelyParseJson<InitialWorldBuild>(response);

      if (!parsedResponse) {
        throw new Error("AI 响应为空或格式不正确，无法解析为 JSON。");
      }

      const validation = initialWorldBuildSchema.safeParse(parsedResponse);

      if (!validation.success) {
        logger.error("AI 世界设定响应验证失败:", validation.error.flatten());
        logger.debug("验证失败的对象:", parsedResponse);
        throw new Error(
          `AI 返回的世界设定格式不正确: ${validation.error.message}`,
        );
      }

      logger.info("初始世界设定已成功生成并通过验证。");
      return validation.data;
    } catch (error) {
      logger.warn(
        `生成初始世界设定失败 (尝试次数 ${i + 1}/${retries}):`,
        error instanceof Error ? error.message : String(error),
      );
      if (i === retries - 1) {
        logger.error("已达到最大重试次数，生成初始世界设定失败。");
        throw error;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  throw new Error("在所有重试后，生成初始世界设定仍然失败。");
}

/**
 * 将初始世界设定元素保存到 PostgreSQL 和向量存储中。
 *
 * @param novelId 小说的 ID。
 * @param worldElements 要保存的结构化世界元素。
 * @param embeddingConfig 用于生成嵌入向量的 AI 模型配置。
 */
export async function saveInitialWorldElements(
  novelId: string,
  worldElements: InitialWorldBuild,
  embeddingConfig: ModelConfig,
) {
  const { roles, scenes, clues } = worldElements;

  logger.info(`开始为小说 ${novelId} 保存初始世界元素。`);

  // 步骤 1: 在一个事务中向 PostgreSQL 写入数据
  logger.info(`正在向 PostgreSQL 插入初始世界元素...`);
  await prisma.$transaction(async (tx) => {
    if (roles.length > 0) {
      await tx.novelRole.createMany({
        data: roles.map((role) => ({
          novelId,
          name: role.name,
          content: role.description,
        })),
        skipDuplicates: true,
      });
    }
    if (scenes.length > 0) {
      await tx.novelScene.createMany({
        data: scenes.map((scene) => ({
          novelId,
          name: scene.name,
          content: scene.description,
        })),
        skipDuplicates: true,
      });
    }
    if (clues.length > 0) {
      await tx.novelClue.createMany({
        data: clues.map((clue) => ({
          novelId,
          name: clue.name,
          content: clue.description,
        })),
        skipDuplicates: true,
      });
    }
  });
  logger.info(`已成功为小说 ${novelId} 保存初始世界设定至 PostgreSQL。`);

  // 步骤 2: 在事务外部，获取刚刚创建的记录
  logger.info(`正在从 PostgreSQL 获取新创建的记录以进行向量化...`);
  const [createdRoles, createdScenes, createdClues] = await Promise.all([
    roles.length > 0
      ? prisma.novelRole.findMany({
          where: { novelId, name: { in: roles.map((r) => r.name) } },
        })
      : Promise.resolve([]),
    scenes.length > 0
      ? prisma.novelScene.findMany({
          where: { novelId, name: { in: scenes.map((s) => s.name) } },
        })
      : Promise.resolve([]),
    clues.length > 0
      ? prisma.novelClue.findMany({
          where: { novelId, name: { in: clues.map((c) => c.name) } },
        })
      : Promise.resolve([]),
  ]);
  logger.info(`成功获取新创建的记录。`);

  // 步骤 3: 同样在事务外部，填充向量存储
  logger.info(`正在为小说 ${novelId} 填充向量存储...`);
  await Promise.all([
    createdRoles.length > 0 &&
      addElementsToCollection(
        `novel_${novelId}_roles`,
        createdRoles,
        embeddingConfig,
      ),
    createdScenes.length > 0 &&
      addElementsToCollection(
        `novel_${novelId}_scenes`,
        createdScenes,
        embeddingConfig,
      ),
    createdClues.length > 0 &&
      addElementsToCollection(
        `novel_${novelId}_clues`,
        createdClues,
        embeddingConfig,
      ),
  ]);

  logger.info(`已成功为小说 ${novelId} 填充向量存储。`);
}

/**
 * "演化"阶段: 分析新章节内容, 提取世界观的演变, 并更新数据库与向量存储。
 *
 * @param novelId - 小说的ID
 * @param chapterContent - 新生成的章节内容
 * @param generationConfig - 用于内容生成的AI配置
 * @param embeddingConfig - 用于向量化的AI配置
 */
export async function evolveWorldFromChapter(
  novelId: string,
  chapterContent: string,
  generationConfig: ModelConfig,
  embeddingConfig: ModelConfig,
  retries = 5,
): Promise<void> {
  logger.info(`[世界演化] 开始为小说 ${novelId} 进行世界演化...`);

  // 步骤 1: 识别章节中提及的实体
  let identifiedEntities: IdentifiedEntities;
  for (let i = 0; i < retries; i++) {
    try {
      logger.info(
        `[世界演化] 步骤 1/4: 识别章节中的实体... (尝试 ${i + 1}/${retries})`,
      );
      const identificationPrompt = interpolatePrompt(
        ENTITY_IDENTIFICATION_PROMPT,
        {
          chapterContent,
        },
      );
      logger.debug(
        `[世界演化] 步骤 1/4: 生成的实体识别 Prompt:
${identificationPrompt}`,
      );
      const responseStream = await getChatCompletion(
        "识别世界观实体",
        generationConfig,
        identificationPrompt,
        { response_format: { type: "json_object" }, stream: true },
      );
      if (!responseStream) throw new Error("AI 未返回实体识别响应流。");

      const response = await readStreamToString(responseStream);
      if (!response) throw new Error("从 AI 实体识别流中未能读取到任何内容。");
      logger.debug(`[世界演化] 步骤 1/4: AI 原始响应: ${response}`);

      const parsedJson = safelyParseJson<IdentifiedEntities>(response);
      if (!parsedJson) {
        logger.error("[世界演化] 无法解析实体识别的 AI 响应。响应:", response);
        throw new Error("AI 实体识别响应格式不正确。");
      }

      const validation = entityIdentificationSchema.safeParse(parsedJson);
      if (!validation.success) {
        logger.error(
          "[世界演化] 实体识别响应验证失败:",
          validation.error.flatten(),
        );
        throw new Error("AI 返回的实体列表格式不正确。");
      }
      identifiedEntities = validation.data;
      logger.info(
        `[世界演化] 实体识别成功: ${identifiedEntities.roles.length}角色, ${identifiedEntities.scenes.length}场景, ${identifiedEntities.clues.length}线索。`,
      );
      logger.debug("[世界演化] 识别出的实体:", identifiedEntities);

      // 成功后，跳出循环
      break;
    } catch (error) {
      logger.warn(
        `[世界演化] 步骤 1/4: 实体识别失败 (尝试 ${i + 1}/${retries})`,
        error instanceof Error ? error.message : error,
      );
      if (i === retries - 1) {
        logger.error(
          "[世界演化] 步骤 1/4: 实体识别已达最大重试次数，演化终止。",
          error instanceof Error ? error.stack : error,
        );
        return; // 识别失败则终止流程
      }
      // 等待一秒再重试
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
  }

  // @ts-ignore
  if (!identifiedEntities) {
    logger.error("[世界演化] 在所有重试后，未能成功识别实体。");
    return;
  }

  if (
    identifiedEntities.roles.length === 0 &&
    identifiedEntities.scenes.length === 0 &&
    identifiedEntities.clues.length === 0
  ) {
    logger.info("[世界演化] 未识别到任何相关实体，演化结束。");
    return;
  }

  // 步骤 2: 从数据库读取现有实体的描述
  logger.info("[世界演化] 步骤 2/4: 从数据库读取现有实体...");
  const [existingRoles, existingScenes, existingClues] = await Promise.all([
    identifiedEntities.roles.length > 0
      ? prisma.novelRole.findMany({
          where: { novelId, name: { in: identifiedEntities.roles } },
        })
      : Promise.resolve([]),
    identifiedEntities.scenes.length > 0
      ? prisma.novelScene.findMany({
          where: { novelId, name: { in: identifiedEntities.scenes } },
        })
      : Promise.resolve([]),
    identifiedEntities.clues.length > 0
      ? prisma.novelClue.findMany({
          where: { novelId, name: { in: identifiedEntities.clues } },
        })
      : Promise.resolve([]),
  ]);

  const existingRolesMap = new Map(
    existingRoles.map((r) => [r.name, r.content]),
  );
  const existingScenesMap = new Map(
    existingScenes.map((s) => [s.name, s.content]),
  );
  const existingCluesMap = new Map(
    existingClues.map((c) => [c.name, c.content]),
  );
  logger.info("[世界演化] 读取现有实体数据完成。");
  logger.debug(
    "[世界演化] 已存在的角色描述:",
    Object.fromEntries(existingRolesMap),
  );
  logger.debug(
    "[世界演化] 已存在的场景描述:",
    Object.fromEntries(existingScenesMap),
  );
  logger.debug(
    "[世界演化] 已存在的线索描述:",
    Object.fromEntries(existingCluesMap),
  );

  // 步骤 3: 并行调用 AI 进行信息融合
  logger.info("[世界演化] 步骤 3/4: 调用 AI 进行信息融合...");
  const fusedEntities: {
    roles: { name: string; content: string }[];
    scenes: { name: string; content: string }[];
    clues: { name: string; content: string }[];
  } = { roles: [], scenes: [], clues: [] };

  const fusionTask = async (
    entityType: "角色" | "场景" | "线索",
    entityName: string,
    existingDescription: string,
  ) => {
    for (let i = 0; i < retries; i++) {
      try {
        const fusionPrompt = interpolatePrompt(WORLD_FUSION_PROMPT, {
          entityType,
          entityName,
          existingDescription,
          chapterContent,
        });

        logger.debug(
          `[世界演化] 为实体 "${entityName}" 生成的融合 Prompt:
${fusionPrompt}`,
        );

        const response = (await getChatCompletion(
          `融合世界观-${entityType}`,
          generationConfig,
          fusionPrompt,
        )) as string;

        if (!response) {
          throw new Error(`AI 未返回 ${entityName} 的融合描述。`);
        }

        const parts = response.split("---");
        const coreDefinition = parts[0].trim();

        if (parts.length < 2) {
          logger.warn(
            `[世界演化] 实体 "${entityName}" 的 AI 响应未使用 '---' 分隔符，将使用完整响应作为核心设定。`,
          );
        }

        if (!coreDefinition) {
          throw new Error(`AI 返回了空的 ${entityName} 核心设定。`);
        }

        return { name: entityName, content: coreDefinition };
      } catch (error) {
        logger.warn(
          `[世界演化] 融合实体 "${entityName}" 失败 (尝试 ${i + 1}/${retries}):`,
          error,
        );
        if (i === retries - 1) {
          logger.error(
            `[世界演化] 融合实体 "${entityName}" 已达最大重试次数，将跳过此实体。`,
          );
          return null;
        }
      }
    }
    return null;
  };

  const fusionPromises = [
    ...identifiedEntities.roles.map((name) =>
      fusionTask("角色", name, existingRolesMap.get(name) || "新登场"),
    ),
    ...identifiedEntities.scenes.map((name) =>
      fusionTask("场景", name, existingScenesMap.get(name) || "新登场"),
    ),
    ...identifiedEntities.clues.map((name) =>
      fusionTask("线索", name, existingCluesMap.get(name) || "新登场"),
    ),
  ];

  const results = await Promise.all(fusionPromises);
  results.forEach((result, index) => {
    if (result) {
      if (index < identifiedEntities.roles.length) {
        fusedEntities.roles.push(result);
      } else if (
        index <
        identifiedEntities.roles.length + identifiedEntities.scenes.length
      ) {
        fusedEntities.scenes.push(result);
      } else {
        fusedEntities.clues.push(result);
      }
    }
  });

  logger.info(
    `[世界演化] 信息融合完成: 成功融合 ${
      fusedEntities.roles.length +
      fusedEntities.scenes.length +
      fusedEntities.clues.length
    } 个实体。`,
  );
  logger.debug("[世界演化] 融合后的实体:", fusedEntities);

  if (
    fusedEntities.roles.length === 0 &&
    fusedEntities.scenes.length === 0 &&
    fusedEntities.clues.length === 0
  ) {
    logger.info("[世界演化] AI 未能成功融合任何实体信息。结束流程。");
    return;
  }

  // 步骤 4: 将融合后的结果存入数据库和向量存储
  logger.info("[世界演化] 步骤 4/4: 更新数据库和向量存储...");
  try {
    await prisma.$transaction(async (tx) => {
      const upsertPromises = [
        ...fusedEntities.roles.map((role) =>
          tx.novelRole.upsert({
            where: { novelId_name: { novelId, name: role.name } },
            update: { content: role.content },
            create: { novelId, name: role.name, content: role.content },
          }),
        ),
        ...fusedEntities.scenes.map((scene) =>
          tx.novelScene.upsert({
            where: { novelId_name: { novelId, name: scene.name } },
            update: { content: scene.content },
            create: { novelId, name: scene.name, content: scene.content },
          }),
        ),
        ...fusedEntities.clues.map((clue) =>
          tx.novelClue.upsert({
            where: { novelId_name: { novelId, name: clue.name } },
            update: { content: clue.content },
            create: { novelId, name: clue.name, content: clue.content },
          }),
        ),
      ];
      await Promise.all(upsertPromises);
      logger.info("[世界演化] 数据库事务更新成功。");
    });

    const [rolesToUpsert, scenesToUpsert, cluesToUpsert] = await Promise.all([
      fusedEntities.roles.length > 0
        ? prisma.novelRole.findMany({
            where: {
              novelId,
              name: { in: fusedEntities.roles.map((r) => r.name) },
            },
          })
        : Promise.resolve([]),
      fusedEntities.scenes.length > 0
        ? prisma.novelScene.findMany({
            where: {
              novelId,
              name: { in: fusedEntities.scenes.map((s) => s.name) },
            },
          })
        : Promise.resolve([]),
      fusedEntities.clues.length > 0
        ? prisma.novelClue.findMany({
            where: {
              novelId,
              name: { in: fusedEntities.clues.map((c) => c.name) },
            },
          })
        : Promise.resolve([]),
    ]);

    await Promise.all([
      rolesToUpsert.length > 0 &&
        upsertElementsInCollection(
          `novel_${novelId}_roles`,
          rolesToUpsert,
          embeddingConfig,
        ),
      scenesToUpsert.length > 0 &&
        upsertElementsInCollection(
          `novel_${novelId}_scenes`,
          scenesToUpsert,
          embeddingConfig,
        ),
      cluesToUpsert.length > 0 &&
        upsertElementsInCollection(
          `novel_${novelId}_clues`,
          cluesToUpsert,
          embeddingConfig,
        ),
    ]);

    logger.info("[世界演化] 向量存储更新成功。演化流程全部完成。");
  } catch (dbError) {
    logger.error({
      msg: `[世界演化] 步骤 4/4: 更新数据库或向量存储时发生严重错误`,
      err: dbError,
    });
  }
}
