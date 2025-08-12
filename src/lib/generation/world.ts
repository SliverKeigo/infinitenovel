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
  retries = 3,
): Promise<InitialWorldBuild> {
  const worldBuildingPrompt = `
    你是一位世界构建大师和小说分析师。请仔细阅读以下的故事主大纲和初始几章的详细规划，然后基于这些信息，识别出这个故事最核心的、必须预先设定的“世界元素”。

    **输出格式要求:**
    请严格按照以下 JSON 格式提供你的回答，不要包含任何 markdown 语法 (\`\`\`json\`) 或其他解释性文本。
    对于每一个角色、场景或线索，提供一个名称（name）和一段详细的描述（description）。

    {
      "roles": [
        { "name": "核心角色1", "description": "角色的背景、性格、目标、外貌等..." },
        { "name": "核心角色2", "description": "..." }
      ],
      "scenes": [
        { "name": "关键场景1", "description": "这个场景的环境、氛围、重要性等..." },
        { "name": "关键场景2", "description": "..." }
      ],
      "clues": [
        { "name": "关键线索或物品1", "description": "这个线索或物品的详细信息、作用..." }
      ]
    }

    ---
    **故事背景资料**
    ---

    **主大纲:**
    ${mainOutline}

    **初始章节详细规划:**
    ${JSON.stringify(detailedOutline, null, 2)}
  `;

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
    await Promise.all([
      tx.novelRole.createMany({
        data: roles.map((role) => ({
          novelId,
          name: role.name,
          content: role.description,
        })),
      }),
      tx.novelScene.createMany({
        data: scenes.map((scene) => ({
          novelId,
          name: scene.name,
          content: scene.description,
        })),
      }),
      tx.novelClue.createMany({
        data: clues.map((clue) => ({
          novelId,
          name: clue.name,
          content: clue.description,
        })),
      }),
    ]);
  });
  logger.info(`已成功为小说 ${novelId} 保存初始世界设定至 PostgreSQL。`);

  // 步骤 2: 在事务外部，获取刚刚创建的记录
  logger.info(`正在从 PostgreSQL 获取新创建的记录以进行向量化...`);
  const [createdRoles, createdScenes, createdClues] = await Promise.all([
    prisma.novelRole.findMany({
      where: { novelId, name: { in: roles.map((r) => r.name) } },
    }),
    prisma.novelScene.findMany({
      where: { novelId, name: { in: scenes.map((s) => s.name) } },
    }),
    prisma.novelClue.findMany({
      where: { novelId, name: { in: clues.map((c) => c.name) } },
    }),
  ]);
  logger.info(`成功获取新创建的记录。`);

  // 步骤 3: 同样在事务外部，填充向量存储
  logger.info(`正在为小说 ${novelId} 填充向量存储...`);
  await Promise.all([
    addElementsToCollection(
      `novel_${novelId}_roles`,
      createdRoles,
      embeddingConfig,
    ),
    addElementsToCollection(
      `novel_${novelId}_scenes`,
      createdScenes,
      embeddingConfig,
    ),
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
): Promise<void> {
  logger.info(`[世界演化] 开始为小说 ${novelId} 进行世界演化...`);

  const evolutionPrompt = `
    你是一个世界观演化分析引擎。你的任务是阅读以下小说章节内容，并与已知世界设定进行对比，提取出所有“新的”和“被更新的”世界元素。

    **分析重点:**
    1.  **新角色/场景/线索 (newRoles, newScenes, newClues)**: 识别并提取章节中全新出现的、之前从未提及的角色、场景或线索。
    2.  **更新的角色/场景/线索 (updatedRoles, updatedScenes, updatedClues)**: 识别那些已经存在但其描述在本章中得到显著补充、改变或发展的角色、场景或线索。请提供它们的名称和“更新后的”完整描述。

    **输出格式要求:**
    请严格按照以下 JSON 格式提供回答，如果某个类别下没有内容，请返回空数组 []。不要添加任何额外解释。

    {
      "newRoles": [{ "name": "新角色名", "description": "新角色的完整描述" }],
      "updatedRoles": [{ "name": "被更新角色名", "updatedDescription": "该角色更新后的完整描述" }],
      "newScenes": [{ "name": "新场景名", "description": "新场景的完整描述" }],
      "updatedScenes": [{ "name": "被更新场景名", "updatedDescription": "该场景更新后的完整描述" }],
      "newClues": [{ "name": "新线索名", "description": "新线索的完整描述" }],
      "updatedClues": [{ "name": "被更新线索名", "updatedDescription": "该线索更新后的完整描述" }]
    }

    **待分析的章节内容:**
    ---
    ${chapterContent}
    ---
  `;

  try {
    const responseStream = await getChatCompletion(
      "提取世界观演变",
      generationConfig,
      evolutionPrompt,
      { response_format: { type: "json_object" }, stream: true },
    );

    if (!responseStream) {
      logger.warn("[世界演化] AI 服务未返回响应流。跳过演化。");
      return;
    }

    const reader = responseStream.getReader();
    const decoder = new TextDecoder();
    let response = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response += decoder.decode(value);
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

    const evolution = validation.data;
    const {
      newRoles,
      updatedRoles,
      newScenes,
      updatedScenes,
      newClues,
      updatedClues,
    } = evolution;

    if (
      [
        newRoles,
        updatedRoles,
        newScenes,
        updatedScenes,
        newClues,
        updatedClues,
      ].every((arr) => arr.length === 0)
    ) {
      logger.info("[世界演化] AI 未提取到新的或更新的世界元素。结束流程。");
      return;
    }

    // 用于向量存储更新的元素集合
    const elementsToUpsertInVectorDB = {
      roles: [] as { id: string; name: string; content: string }[],
      scenes: [] as { id: string; name: string; content: string }[],
      clues: [] as { id: string; name: string; content: string }[],
    };

    // 数据库事务
    await prisma.$transaction(async (tx) => {
      // 1. 创建新元素
      if (newRoles.length > 0) {
        await tx.novelRole.createMany({
          data: newRoles.map((r) => ({
            novelId,
            name: r.name,
            content: r.description,
          })),
        });
      }
      if (newScenes.length > 0) {
        await tx.novelScene.createMany({
          data: newScenes.map((s) => ({
            novelId,
            name: s.name,
            content: s.description,
          })),
        });
      }
      if (newClues.length > 0) {
        await tx.novelClue.createMany({
          data: newClues.map((c) => ({
            novelId,
            name: c.name,
            content: c.description,
          })),
        });
      }

      // 2. 更新现有元素
      for (const role of updatedRoles) {
        await tx.novelRole.updateMany({
          where: { novelId, name: role.name },
          data: { content: role.updatedDescription },
        });
      }
      for (const scene of updatedScenes) {
        await tx.novelScene.updateMany({
          where: { novelId, name: scene.name },
          data: { content: scene.updatedDescription },
        });
      }
      for (const clue of updatedClues) {
        await tx.novelClue.updateMany({
          where: { novelId, name: clue.name },
          data: { content: clue.updatedDescription },
        });
      }
      logger.info("[世界演化] 数据库事务更新成功。");
    });

    // 3. 在事务外部，获取所有受影响的记录，用于更新向量库
    const allRoleNames = [
      ...newRoles.map((r) => r.name),
      ...updatedRoles.map((r) => r.name),
    ];
    const allSceneNames = [
      ...newScenes.map((s) => s.name),
      ...updatedScenes.map((s) => s.name),
    ];
    const allClueNames = [
      ...newClues.map((c) => c.name),
      ...updatedClues.map((c) => c.name),
    ];

    if (allRoleNames.length > 0) {
      elementsToUpsertInVectorDB.roles = await prisma.novelRole.findMany({
        where: { novelId, name: { in: allRoleNames } },
      });
    }
    if (allSceneNames.length > 0) {
      elementsToUpsertInVectorDB.scenes = await prisma.novelScene.findMany({
        where: { novelId, name: { in: allSceneNames } },
      });
    }
    if (allClueNames.length > 0) {
      elementsToUpsertInVectorDB.clues = await prisma.novelClue.findMany({
        where: { novelId, name: { in: allClueNames } },
      });
    }

    // 4. 更新向量存储 (在事务之外执行)
    await Promise.all([
      upsertElementsInCollection(
        `novel_${novelId}_roles`,
        elementsToUpsertInVectorDB.roles,
        embeddingConfig,
      ),
      upsertElementsInCollection(
        `novel_${novelId}_scenes`,
        elementsToUpsertInVectorDB.scenes,
        embeddingConfig,
      ),
      upsertElementsInCollection(
        `novel_${novelId}_clues`,
        elementsToUpsertInVectorDB.clues,
        embeddingConfig,
      ),
    ]);

    logger.info("[世界演化] 向量存储更新成功。");
  } catch (error) {
    logger.error("[世界演化] 世界演化流程失败:", error);
    // 可根据需要向上抛出错误
    throw new Error("从章节内容演化世界状态失败。");
  }
}
