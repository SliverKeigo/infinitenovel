import logger from "@/lib/logger";
import { ModelConfig } from "@/types/ai";
import { getChatCompletion } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import { summarizeRecentChapters, updateStorySoFarSummary } from "./summary";
import { safelyParseJson } from "../utils/json";
import { z } from "zod";
import { readStreamToString } from "../utils/stream";

/**
 * 根据总章节数和当前章节号，从主大纲中提取当前卷的大纲。
 * @param mainOutline - 完整的主线大纲。
 * @param currentChapterNumber - 当前正在生成的章节号。
 * @returns 当前卷的大纲文本，如果找不到则返回整个主线大纲。
 */
function getCurrentVolumeOutline(
  mainOutline: string,
  currentChapterNumber: number,
): string {
  // 使用更稳健的正则表达式按卷进行分割
  // 正则表达式匹配以 "####" 或 "**" 开头，后跟 "第X卷" 的模式
  const volumes = mainOutline.split(
    /(?=####\s*第二卷：|####\s*第三卷：|####\s*第四卷：|####\s*第五卷：|####\s*第六卷：|\*\*第二卷：|\*\*第三卷：|\*\*第四卷：|\*\*第五卷：|\*\*第六卷：)/,
  );

  if (volumes.length <= 1 && mainOutline.includes("第一卷")) {
    return mainOutline; // 如果只有一个卷，直接返回
  }

  let currentVolumeText = "";

  for (const volumeText of volumes) {
    // 匹配 "预计章节：251-500" 或 "章节：1-50" 等格式
    const match = volumeText.match(/(?:预计)?章节：\s*(\d+)\s*-\s*(\d+)/);

    if (match) {
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      if (currentChapterNumber >= start && currentChapterNumber <= end) {
        currentVolumeText = volumeText;
        break;
      }
    }
  }

  if (currentVolumeText) {
    logger.info(
      `[大纲范围锁定] 已为章节 ${currentChapterNumber} 锁定到当前卷的大纲。`,
    );
    return currentVolumeText;
  }

  logger.warn(
    `[大纲范围锁定] 未能为章节 ${currentChapterNumber} 找到匹配的卷。将使用完整大纲作为后备。`,
  );
  return mainOutline; // 后备方案
}

import {
  MAIN_OUTLINE_PROMPT,
  DETAILED_OUTLINE_PROMPT,
  COLD_START_DETAILED_OUTLINE_PROMPT,
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
  style: string,
  tone: string,
  generationConfig: ModelConfig,
  retries = 30,
): Promise<string> {
  const promptValues = {
    title,
    summary,
    category: `${category} / ${subCategory}`,
    estimatedChapters: String(estimatedChapters),
    style,
    tone,
  };
  const outlinePrompt = interpolatePrompt(MAIN_OUTLINE_PROMPT, promptValues);

  for (let i = 0; i < retries; i++) {
    try {
      logger.info(`正在生成主大纲 (尝试次数 ${i + 1}/${retries})...`);
      const stream = await getChatCompletion(
        "生成主大纲",
        generationConfig,
        outlinePrompt,
        { stream: true },
      );

      if (!stream) {
        throw new Error("AI 服务返回了空的流。");
      }

      const mainOutline = await readStreamToString(stream);
      if (mainOutline.trim().length < 50) {
        // 增加一个简单的验证，确保大纲不是太短或空的
        throw new Error("生成的主大纲内容过短或为空。");
      }

      logger.info("主大纲已成功生成并通过验证。");
      return mainOutline;
    } catch (error) {
      logger.warn(
        `生成主大纲失败 (尝试次数 ${i + 1}/${retries}):`,
        error instanceof Error ? error.message : String(error),
      );
      if (i === retries - 1) {
        logger.error("已达到最大重试次数，生成主大纲失败。");
        throw error;
      }
      await new Promise((res) => setTimeout(res, 1000 * (i + 1))); // 增加延迟
    }
  }

  throw new Error("在所有重试后，生成主大纲仍然失败。");
}

/**
 * 生成下一批详细的、逐章的大纲。
 */
export async function generateDetailedOutline(
  novelId: string,
  generationConfig: ModelConfig,
  chaptersToGenerate: number = 10,
  retries = 30,
): Promise<DetailedOutlineBatch> {
  // 在生成新大纲前，首先触发一次长篇摘要的滚动更新
  await updateStorySoFarSummary(novelId, generationConfig);

  // 更新需要重新从数据库获取 novel 对象，以确保拿到最新的 storySoFarSummary
  const updatedNovel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      title: true,
      summary: true,
      outline: true,
      style: true,
      tone: true,
      type: true,
      storySoFarSummary: true,
      chapters: {
        orderBy: {
          chapterNumber: "desc",
        },
        take: 1,
      },
    },
  });

  if (!updatedNovel) {
    throw new Error(`在更新摘要后未能重新获取小说 ${novelId}。`);
  }

  const lastChapterNumber = updatedNovel.chapters[0]?.chapterNumber || 0;
  const isColdStart = lastChapterNumber === 0;

  let detailedOutlinePrompt;
  let promptValues;

  if (isColdStart) {
    // 对于冷启动，生成一个更长的初始批次来奠定坚实的基础
    chaptersToGenerate = 20;
    logger.info(
      `小说 ${novelId} 为冷启动，将生成 ${chaptersToGenerate} 章的开篇大纲。`,
    );

    const currentVolumeOutline = getCurrentVolumeOutline(
      updatedNovel.outline || "暂无主线大纲。",
      1, // Cold start always begins at chapter 1
    );

    promptValues = {
      chaptersToGenerate: String(chaptersToGenerate),
      title: updatedNovel.title,
      summary: updatedNovel.summary,
      category: updatedNovel.type,
      style: updatedNovel.style || "暂未设定",
      tone: updatedNovel.tone || "暂未设定",
      outline: currentVolumeOutline,
    };
    detailedOutlinePrompt = interpolatePrompt(
      COLD_START_DETAILED_OUTLINE_PROMPT,
      promptValues,
    );
  } else {
    logger.info(`小说 ${novelId} 为续写，使用标准大纲生成策略。`);
    const recentSummary = await summarizeRecentChapters(
      novelId,
      generationConfig,
    );
    const nextChapterNumber = lastChapterNumber + 1;

    const currentVolumeOutline = getCurrentVolumeOutline(
      updatedNovel.outline || "暂无主线大纲。",
      nextChapterNumber,
    );

    promptValues = {
      chaptersToGenerate: String(chaptersToGenerate),
      nextChapterNumber: String(nextChapterNumber),
      title: updatedNovel.title,
      summary: updatedNovel.summary, // novel summary is the overall summary
      outline: currentVolumeOutline,
      style: updatedNovel.style || "暂未设定",
      tone: updatedNovel.tone || "暂未设定",
      storySoFarSummary:
        updatedNovel.storySoFarSummary || "这是故事的开端，还没有长篇摘要。",
      recentSummary: recentSummary,
    };
    detailedOutlinePrompt = interpolatePrompt(
      DETAILED_OUTLINE_PROMPT,
      promptValues,
    );
  }

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
