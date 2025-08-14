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
  INITIAL_WORLD_BUILD_PROMPT,
  WORLD_EVOLUTION_PROMPT,
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

// 用于“演化”步骤的新模式
const worldElementUpdateSchema = z.object({
  name: z.string(),
  updatedDescription: z.string(),
});

const worldEvolutionSchema = z.object({
  newRoles: z.array(worldElementSchema).default([]),
  updatedRoles: z.array(worldElementUpdateSchema).default([]),
  newScenes: z.array(worldElementSchema).default([]),
  updatedScenes: z.array(worldElementUpdateSchema).default([]),
  newClues: z.array(worldElementSchema).default([]),
  updatedClues: z.array(worldElementUpdateSchema).default([]),
});

export type WorldEvolution = z.infer<typeof worldEvolutionSchema>;

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
  retries = 30,
): Promise<void> {
  logger.info(`[世界演化] 开始为小说 ${novelId} 进行世界演化...`);

  const evolutionPrompt = interpolatePrompt(WORLD_EVOLUTION_PROMPT, {
    chapterContent,
  });

  let evolution: WorldEvolution | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      logger.info(
        `[世界演化] 正在提取世界观演变 (尝试次数 ${i + 1}/${retries})...`,
      );
      const responseStream = await getChatCompletion(
        "提取世界观演变",
        generationConfig,
        evolutionPrompt,
        { response_format: { type: "json_object" }, stream: true },
      );

      if (!responseStream) {
        throw new Error("AI 服务未返回响应流。");
      }

      const response = await readStreamToString(responseStream);
      if (!response) {
        throw new Error("从 AI 流中未能读取到任何内容。");
      }

      const parsedJson = safelyParseJson<WorldEvolution>(response);
      if (!parsedJson) {
        logger.error(
          "[世界演化] 从 AI 响应中未能解析出任何 JSON 内容。原始响应:",
          response,
        );
        throw new Error("AI 演化响应为空或格式不正确，无法解析为 JSON。");
      }

      const validation = worldEvolutionSchema.safeParse(parsedJson);

      if (!validation.success) {
        logger.error(
          "[世界演化] AI 演化响应验证失败:",
          validation.error.flatten(),
        );
        logger.debug("[世界演化] 验证失败的对象:", parsedJson);
        throw new Error("AI 返回的世界演化格式不正确。");
      }

      evolution = validation.data;
      logger.info("[世界演化] AI 提取成功。");
      break; // 成功则跳出循环
    } catch (error) {
      logger.warn(
        `[世界演化] 世界演化流程失败 (尝试次数 ${i + 1}/${retries}):`,
        error instanceof Error ? error.message : String(error),
      );
      if (i === retries - 1) {
        logger.error(
          "[世界演化] 已达到最大重试次数，世界演化失败，将跳过此步骤。",
        );
        return; // 最终失败，直接返回，不抛出错误
      }
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
  }

  if (!evolution) {
    logger.info("[世界演化] 未能成功提取世界演化信息。");
    return;
  }

  const {
    newRoles,
    updatedRoles,
    newScenes,
    updatedScenes,
    newClues,
    updatedClues,
  } = evolution;

  // 辅助函数，用于将新元素和更新元素合并并去重
  const mergeAndUnique = <
    T extends { name: string; description: string },
    U extends { name: string; updatedDescription: string },
  >(
    newItems: T[],
    updatedItems: U[],
  ): { name: string; content: string }[] => {
    const itemMap = new Map<string, string>();

    [...newItems, ...updatedItems].forEach((item) => {
      const content =
        "description" in item ? item.description : item.updatedDescription;
      itemMap.set(item.name, content);
    });

    return Array.from(itemMap.entries()).map(([name, content]) => ({
      name,
      content,
    }));
  };

  const allRoles = mergeAndUnique(newRoles, updatedRoles);
  const allScenes = mergeAndUnique(newScenes, updatedScenes);
  const allClues = mergeAndUnique(newClues, updatedClues);

  if (
    allRoles.length === 0 &&
    allScenes.length === 0 &&
    allClues.length === 0
  ) {
    logger.info("[世界演化] AI 未提取到新的或更新的世界元素。结束流程。");
    return;
  }

  try {
    // 数据库事务
    await prisma.$transaction(async (tx) => {
      // 使用 upsert 批量处理所有角色、场景和线索
      const upsertPromises = [
        ...allRoles.map((role) =>
          tx.novelRole.upsert({
            where: { novelId_name: { novelId, name: role.name } },
            update: { content: role.content },
            create: { novelId, name: role.name, content: role.content },
          }),
        ),
        ...allScenes.map((scene) =>
          tx.novelScene.upsert({
            where: { novelId_name: { novelId, name: scene.name } },
            update: { content: scene.content },
            create: { novelId, name: scene.name, content: scene.content },
          }),
        ),
        ...allClues.map((clue) =>
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

    // 3. 在事务外部，获取所有受影响的记录，用于更新向量库
    const allRoleNames = allRoles.map((r) => r.name);
    const allSceneNames = allScenes.map((s) => s.name);
    const allClueNames = allClues.map((c) => c.name);

    const [rolesToUpsert, scenesToUpsert, cluesToUpsert] = await Promise.all([
      allRoleNames.length > 0
        ? prisma.novelRole.findMany({
            where: { novelId, name: { in: allRoleNames } },
          })
        : Promise.resolve([]),
      allSceneNames.length > 0
        ? prisma.novelScene.findMany({
            where: { novelId, name: { in: allSceneNames } },
          })
        : Promise.resolve([]),
      allClueNames.length > 0
        ? prisma.novelClue.findMany({
            where: { novelId, name: { in: allClueNames } },
          })
        : Promise.resolve([]),
    ]);

    // 4. 更新向量存储 (在事务之外执行)
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

    logger.info("[世界演化] 向量存储更新成功。");
  } catch (dbError) {
    logger.error({
      msg: `[世界演化] 在更新数据库或向量存储时发生严重错误，小说ID: ${novelId}`,
      err: dbError,
    });
    // 数据库或向量存储的错误比较严重，但仍然不应中断主流程
  }
}
