import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ModelConfig } from "@/types/ai";
import { getChatCompletion } from "@/lib/ai-client";
import { SUMMARY_PROMPT } from "@/lib/prompts/summary.prompts";
import { interpolatePrompt } from "@/lib/utils/prompt";
import { readStreamToString } from "../utils/stream";
import { STORY_SO_FAR_SUMMARY_UPDATE_PROMPT } from "../prompts/summary.prompts";

const CHAPTERS_PER_SUMMARY_BATCH = 10; // 每10章更新一次长篇摘要

/**
 * 检查是否需要更新故事长篇摘要。
 * @param novelId - 小说 ID。
 * @returns 如果需要更新，则返回 true；否则返回 false。
 */
async function needsSummaryUpdate(novelId: string): Promise<boolean> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: {
      storySoFarSummary: true,
      lastSummaryChapter: true,
      chapters: {
        orderBy: { chapterNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!novel) return false;

  const lastChapterNumber = novel.chapters[0]?.chapterNumber || 0;
  const lastSummaryChapter = novel.lastSummaryChapter || 0;

  // 如果长篇摘要为空，或者最新章节数超过上次总结的章节数一个批次，则需要更新
  return (
    !novel.storySoFarSummary ||
    lastChapterNumber >= lastSummaryChapter + CHAPTERS_PER_SUMMARY_BATCH
  );
}

/**
 * 更新小说的“故事至今”长篇摘要。
 * 这是一个滚动更新的摘要，会整合最近未被总结的章节。
 * @param novelId - 小说 ID。
 * @param generationConfig - AI 模型配置。
 */
export async function updateStorySoFarSummary(
  novelId: string,
  generationConfig: ModelConfig,
  retries = 30,
): Promise<void> {
  const needsUpdate = await needsSummaryUpdate(novelId);
  if (!needsUpdate) {
    logger.info(`小说 ${novelId} 的长篇摘要无需更新。`);
    return;
  }

  logger.info(`开始为小说 ${novelId} 更新长篇摘要...`);

  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { storySoFarSummary: true, lastSummaryChapter: true },
  });

  if (!novel) {
    logger.warn(`在尝试更新摘要时未找到小说 ${novelId}。`);
    return;
  }

  const lastSummaryChapter = novel.lastSummaryChapter || 0;

  // 1. 获取自上次总结以来的所有新章节
  const newChapters = await prisma.novelChapter.findMany({
    where: {
      novelId,
      chapterNumber: {
        gt: lastSummaryChapter,
      },
    },
    orderBy: { chapterNumber: "asc" },
  });

  if (newChapters.length === 0) {
    logger.info(`小说 ${novelId} 没有需要总结的新章节。`);
    return;
  }

  // 2. 将新章节内容合并为“近期进展”
  const recentDevelopments = newChapters
    .map((c) => `# 第 ${c.chapterNumber} 章: ${c.title}\\n${c.content}`)
    .join("\\n\\n---\\n\\n");

  // 3. 构建 prompt
  const prompt = interpolatePrompt(STORY_SO_FAR_SUMMARY_UPDATE_PROMPT, {
    existingSummary:
      novel.storySoFarSummary || "这是故事的开端，请根据近期情节进行首次总结。",
    recentDevelopments,
  });

  // 4. 调用 AI 进行融合
  for (let i = 0; i < retries; i++) {
    try {
      const stream = await getChatCompletion(
        "更新故事长篇摘要",
        generationConfig,
        prompt,
        { stream: true },
      );
      if (!stream) throw new Error("AI未能返回有效的摘要更新流。");

      const updatedSummary = await readStreamToString(stream);
      if (!updatedSummary.trim()) {
        throw new Error("AI返回了空的摘要。");
      }

      // 5. 将新摘要和更新后的章节号存回数据库
      const latestChapterNumberInBatch =
        newChapters[newChapters.length - 1].chapterNumber;
      await prisma.novel.update({
        where: { id: novelId },
        data: {
          storySoFarSummary: updatedSummary,
          lastSummaryChapter: latestChapterNumberInBatch,
        },
      });

      logger.info(
        `已成功为小说 ${novelId} 更新长篇摘要，最新已总结章节为: ${latestChapterNumberInBatch}`,
      );
      return; // 成功后退出
    } catch (error) {
      logger.warn(
        `更新小说 ${novelId} 的长篇摘要失败 (尝试 ${i + 1}/${retries})`,
        error,
      );
      if (i === retries - 1) {
        logger.error(
          `小说 ${novelId} 的长篇摘要更新已达最大重试次数，操作失败。`,
        );
        // 在这里我们选择不抛出错误，以免阻塞主流程，但记录严重错误
        return;
      }
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    }
  }
}

/**
 * 总结小说的最近几个章节。
 * 这用于为 AI 生成后续大纲或章节提供短期上下文。
 *
 * @param novelId - 要总结的小说 ID。
 * @param generationConfig - AI 模型配置。
 * @param chaptersToSummarize - 要总结的最近章节数。
 * @returns 包含最近章节摘要的字符串。
 * @throws 如果找不到章节或摘要生成失败，则抛出错误。
 */
export async function summarizeRecentChapters(
  novelId: string,
  generationConfig: ModelConfig,
  chaptersToSummarize: number = 3,
  retries = 30,
): Promise<string> {
  // 1. 从数据库获取最近的章节
  const recentChapters = await prisma.novelChapter.findMany({
    where: { novelId },
    orderBy: { chapterNumber: "desc" }, // 首先获取最新的章节
    take: chaptersToSummarize,
  });

  if (recentChapters.length === 0) {
    // 如果还没有任何章节，则无需总结。
    // 这是一个有效状态，例如在生成第一个详细大纲时。
    return "这部小说还没有任何章节。";
  }

  // 2. 合并章节内容
  // 反转数组以保持时间顺序（从最旧的到最新的）
  const combinedContent = recentChapters
    .reverse()
    .map(
      (chapter) =>
        `# 第 ${chapter.chapterNumber} 章: ${chapter.title}\\n\\n${chapter.content}`,
    )
    .join(`\\n\\n---\\n\\n`);

  // 3. 使用新的 prompt 模板和插值函数
  const prompt = interpolatePrompt(SUMMARY_PROMPT, {
    combinedContent,
  });

  // 4. 调用 AI 服务获取摘要
  for (let i = 0; i < retries; i++) {
    try {
      logger.info(
        `正在为小说 ${novelId} 总结最近 ${recentChapters.length} 个章节... (尝试 ${
          i + 1
        }/${retries})`,
      );
      logger.debug(`[章节总结] 为小说 ${novelId} 生成的 Prompt:\n${prompt}`);
      const summaryStream = await getChatCompletion(
        "总结最近章节",
        generationConfig,
        prompt,
        { stream: true },
      );

      if (!summaryStream) {
        throw new Error("AI 服务未能成功生成摘要流。");
      }

      const summary = await readStreamToString(summaryStream);

      if (!summary) {
        throw new Error("从 AI 流中未能读取到任何内容。");
      }

      logger.info("最近章节总结成功。");
      return summary;
    } catch (error) {
      logger.warn(
        { err: error },
        `为小说 ${novelId} 总结章节失败 (尝试 ${i + 1}/${retries})`,
      );
      if (i === retries - 1) {
        logger.error(`为小说 ${novelId} 总结章节已达最大重试次数，操作失败。`);
        throw error;
      }
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
  }

  throw new Error("在所有重试后，总结章节仍然失败。");
}
