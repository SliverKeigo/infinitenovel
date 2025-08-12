import logger from "@/lib/logger";
import { ModelConfig } from "@/types/ai";
import { getChatCompletion } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import { summarizeRecentChapters } from "./summary";
import { safelyParseJson } from "../utils/json";
import { z } from "zod";
import { readStreamToString } from "../utils/stream";
import {
  MAIN_OUTLINE_PROMPT,
  DETAILED_OUTLINE_PROMPT,
} from "@/lib/prompts/outline.prompts";
import { interpolatePrompt } from "@/lib/utils/prompt";

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
 */
export async function generateMainOutline(
  title: string,
  summary: string,
  category: string,
  subCategory: string,
  estimatedChapters: number,
  generationConfig: ModelConfig,
) {
  // 准备一个简单的键值对对象，用于插值
  const promptValues = {
    title,
    summary,
    // 在这里合并 category 和 subCategory
    category: `${category} / ${subCategory}`,
    estimatedChapters: String(estimatedChapters),
  };

  const outlinePrompt = interpolatePrompt(MAIN_OUTLINE_PROMPT, promptValues);

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
      style: true,
      tone: true,
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

  // 1. 在代码中处理所有逻辑和计算
  const lastChapterNumber = novel.chapters[0]?.chapterNumber || 0;
  const nextChapterNumber = lastChapterNumber + 1;

  // 2. 准备一个干净的、与模板占位符完全对应的键值对对象
  const promptValues = {
    chaptersToGenerate: String(chaptersToGenerate),
    nextChapterNumber: String(nextChapterNumber),
    title: novel.title,
    summary: novel.summary,
    outline: novel.outline || "暂无主线大纲。",
    style: novel.style || "暂未设定，请根据已有信息自行判断并保持一致。",
    tone: novel.tone || "暂未设定，请根据已有信息自行判断并保持一致。",
    storySoFarSummary:
      novel.storySoFarSummary || "这是故事的开端，还没有长篇摘要。",
    recentSummary: recentSummary,
  };

  // 3. 调用通用的插值函数
  const detailedOutlinePrompt = interpolatePrompt(
    DETAILED_OUTLINE_PROMPT,
    promptValues,
  );

  for (let i = 0; i < retries; i++) {
    try {
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

      const fullResponse = await readStreamToString(responseStream);
      logger.debug(`[AI 原始响应] 大纲生成: ${fullResponse}`);

      if (!fullResponse) {
        throw new Error("从 AI 流中未能读取到任何内容。");
      }

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
