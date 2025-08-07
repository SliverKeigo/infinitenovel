import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ModelConfig } from "@/types/ai";
import { getChatCompletion } from "@/lib/ai-client";

/**
 * Summarizes the most recent chapters of a novel.
 * This is used to provide short-term context to the AI for generating subsequent outlines or chapters.
 *
 * @param novelId - The ID of the novel to summarize.
 * @param generationConfig - The AI model configuration.
 * @param chaptersToSummarize - The number of recent chapters to include in the summary.
 * @returns A string containing the summary of the recent chapters.
 * @throws An error if no chapters are found or if the summary generation fails.
 */
export async function summarizeRecentChapters(
  novelId: string,
  generationConfig: ModelConfig,
  chaptersToSummarize: number = 3,
): Promise<string> {
  // 1. Fetch the most recent chapters from the database
  const recentChapters = await prisma.novelChapter.findMany({
    where: { novelId },
    orderBy: { createdAt: "desc" }, // Get the newest chapters first
    take: chaptersToSummarize,
  });

  if (recentChapters.length === 0) {
    // If there are no chapters yet, there's nothing to summarize.
    // This is a valid state, e.g., when generating the very first detailed outline.
    return "这部小说还没有任何章节。";
  }

  // 2. Combine the content of the chapters
  // Reverse the array to maintain chronological order (oldest of the recent to newest)
  const combinedContent = recentChapters
    .reverse()
    .map((chapter) => `第${chapter.name}章: ${chapter.content}`) // Assuming name is chapter number
    .join(`

---

`);

  // 3. Create a prompt for the AI
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

  // 4. Call the AI service to get the summary
  logger.info(
    `Summarizing last ${recentChapters.length} chapters for novel ${novelId}...`,
  );
  const summary = await getChatCompletion(
    "总结最近章节",
    generationConfig,
    summaryPrompt,
    {
      max_tokens: 500, // Limit summary length
    },
  );

  if (!summary) {
    throw new Error("Failed to generate summary from AI service.");
  }

  logger.info("Recent chapters summarized successfully.");
  return summary;
}
