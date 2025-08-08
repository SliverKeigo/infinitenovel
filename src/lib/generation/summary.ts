import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ModelConfig } from "@/types/ai";
import { getChatCompletion } from "@/lib/ai-client";

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
): Promise<string> {
  // 1. 从数据库获取最近的章节
  const recentChapters = await prisma.novelChapter.findMany({
    where: { novelId },
    orderBy: { createdAt: "desc" }, // 首先获取最新的章节
    take: chaptersToSummarize,
  });

  if (recentChapters.length === 0) {
    // 如果还没有任何章节，则无需总结。
    // 这是一个有效状态，例如在生成第一个详细大纲时。
    return "这部小说还没有任何章节。";
  }

  // 2. 合并章节内容
  // 反转数组以保持时间顺序（从最近的最旧的到最新的）
  const combinedContent = recentChapters
    .reverse()
    .map((chapter) => `第${chapter.chapterNumber}章: ${chapter.content}`)
    .join(`---`);

  // 3. 为 AI 创建提示
  const summaryPrompt = `
    你是一位专业的小说摘要作者。请阅读以下连续的几章内容，并生成一个简洁的、第三人称的摘要，
    概括出期间发生的主要事件、人物的关键行动和情节的重要进展。
    这个摘要将用于为后续章节的创作提供上下文，所以请确保它信息密集且重点突出。

    章节内容如下：
    ---
    ${combinedContent}
    ---

    请直接返回摘要内容，不要添加任何额外的标题、引言或结束语。
  `;

  // 4. 调用 AI 服务获取摘要
  logger.info(
    `正在为小说 ${novelId} 总结最近 ${recentChapters.length} 个章节...`,
  );
  const summary = await getChatCompletion(
    "总结最近章节",
    generationConfig,
    summaryPrompt,
    { stream: false },
  );

  if (!summary) {
    throw new Error("从 AI 服务生成摘要失败。");
  }

  logger.info("最近章节总结成功。");
  return summary as string;
}
