import logger from "@/lib/logger";
import { ModelConfig } from "@/types/ai";
import { getChatCompletion } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import { summarizeRecentChapters } from "./summary";
import { safelyParseJson } from "../utils/json";
import { z } from "zod";
import { readStreamToString, chainStreamables } from "../utils/stream";

export const detailedChapterOutlineSchema = z.object({
  chapterNumber: z.number().int(),
  title: z.string(),
  summary: z.string(),
  keyEvents: z.array(z.string()),
});
export const detailedOutlineBatchSchema = z.array(detailedChapterOutlineSchema);
export type DetailedChapterOutline = z.infer<
  typeof detailedChapterOutlineSchema
>;
export type DetailedOutlineBatch = z.infer<typeof detailedOutlineBatchSchema>;

/**
 * 根据提供的小说详情生成一个高层次的故事大纲。
 * (现有函数 - 无更改)
 */
export async function generateMainOutline(
  title: string,
  summary: string,
  category: string,
  subCategory: string,
  generationConfig: ModelConfig,
) {
  const outlinePrompt = `
    你是一位经验丰富的小说编辑。请为以下设定创作一份引人入胜、结构清晰的故事大纲。
    大纲需要分为三个主要部分：开端、发展、和高潮/结局。请为每个部分生成几个关键的剧情点。

    小说信息如下：
    - 标题: ${title}
    - 类型: ${category} / ${subCategory}
    - 故事简介: ${summary}

    请直接返回大纲内容，不要包含任何额外的问候或解释。
  `;

  logger.info("正在生成主大纲...");
  const stream = await getChatCompletion(
    "生成主大纲",
    generationConfig,
    outlinePrompt,
    { stream: true },
  );

  if (!stream) {
    throw new Error("从 AI 服务生成小说大纲失败。");
  }

  logger.info("主大纲流生成成功。");
  return stream;
}

/**
 * 生成下一批详细的、逐章的大纲。
 *
 * @param novelId - 小说 ID。
 * @param generationConfig - AI 模型配置。
 * @param chaptersToGenerate - 此批次要概述的章节数。
 * @returns 详细章节大纲的结构化数组。
 */
export async function generateDetailedOutline(
  novelId: string,
  generationConfig: ModelConfig,
  chaptersToGenerate: number = 5,
  retries = 6,
): Promise<DetailedOutlineBatch> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      title: true,
      summary: true,
      outline: true,
      storySoFarSummary: true,
      chapters: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });
  if (!novel) {
    throw new Error(`未找到 ID 为 ${novelId} 的小说。`);
  }
  const recentSummary = await summarizeRecentChapters(
    novelId,
    generationConfig,
  );
  const lastChapterNumber = novel.chapters[0]?.chapterNumber
    ? novel.chapters[0]?.chapterNumber
    : 0;

  // 3. 构建智能提示
  const detailedOutlinePrompt = `
    你是一位顶尖的小说策划师，任务是为一部正在创作中的小说生成接下来 ${chaptersToGenerate} 章的详细情节大纲。

    **绝对规则:**
    - 你的输出必须是纯粹的、格式完全正确的 JSON 对象。返回一个包含 "outlines" 键的 JSON 对象，其值为章节大纲数组。
    - 禁止在 JSON 内容之外包含任何文本，包括解释、注释、思考过程或任何非 JSON 字符。
    - 不要使用 Markdown 语法（如 \`\`\`json）。
    - 你的整个响应应直接以 \`{\` 开始，并以 \`}\` 结束。

    **JSON 结构示例:**
    {
      "outlines": [
        {
          "chapterNumber": ${lastChapterNumber + 1},
          "title": "章节标题示例",
          "summary": "章节摘要示例",
          "keyEvents": ["关键事件1", "关键事件2"]
        }
      ]
    }

    请严格遵循以上结构。章节数组中每个对象必须包含以下四个字段：
    1. "chapterNumber": (整数) - 章节序号，从 ${lastChapterNumber + 1} 开始连续递增。
    2. "title": (字符串) - 本章标题。
    3. "summary": (字符串) - 本章情节的简要概述。
    4. "keyEvents": (字符串数组) - 描述本章发生的关键事件、对话或场景的列表。

    **创作所需的上下文信息:**

    **1. 小说核心设定 (全局路线图):**
    - 标题: ${novel.title}
    - 简介: ${novel.summary}
    - 故事主线大纲: ${novel.outline || "暂无主线大纲。"}

    **2. 故事至今的总览 (长期记忆):**
    ${novel.storySoFarSummary || "这是故事的开端，还没有长篇摘要。"}

    **3. 最近发生的事件 (短期记忆):**
    ${recentSummary}

    请基于以上所有信息，富有创造力地规划出接下来 ${chaptersToGenerate} 章的详细情节，确保故事的连贯性和吸引力。
  `;

  for (let i = 0; i < retries; i++) {
    try {
      // 4. 调用 AI 服务
      logger.info(
        `正在为小说 ${novelId} 的接下来 ${chaptersToGenerate} 章生成详细大纲 (尝试次数 ${
          i + 1
        })...`,
      );

      const responseStream = await getChatCompletion(
        "生成详细大纲",
        generationConfig,
        detailedOutlinePrompt,
        { stream: true, response_format: { type: "json_object" } },
      );

      if (!responseStream) {
        throw new Error("从 AI 服务生成详细大纲流失败。");
      }

      // 5. 消费流并组装完整响应
      const fullResponse = await readStreamToString(responseStream);
      logger.debug(`[AI 原始响应] 大纲生成: ${fullResponse}`);

      if (!fullResponse) {
        throw new Error("从 AI 流中未能读取到任何内容。");
      }

      // 6. 验证并解析组装后的响应
      const parsedJson = safelyParseJson(fullResponse);
      const outlinesArray =
        parsedJson.outlines || parsedJson.data || parsedJson;
      const validation = detailedOutlineBatchSchema.safeParse(outlinesArray);

      if (!validation.success) {
        throw new Error(
          `AI 返回了格式错误的详细大纲: ${validation.error.message}`,
        );
      }

      logger.info("详细大纲已成功生成并通过验证。");
      return validation.data;
    } catch (error) {
      logger.warn(
        `生成详细大纲失败 (尝试次数 ${i + 1}/${retries}):`,
        error instanceof Error ? error.message : String(error),
      );
      if (i === retries - 1) {
        logger.error("已达到最大重试次数，生成详细大纲失败。");
        throw error;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  throw new Error("在所有重试后，生成详细大纲仍然失败。");
}
