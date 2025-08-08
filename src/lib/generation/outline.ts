import logger from "@/lib/logger";
import { ModelConfig } from "@/types/ai";
import { getChatCompletion } from "@/lib/ai-client";
import { prisma } from "@/lib/prisma";
import { summarizeRecentChapters } from "./summary";
import { safelyParseJson } from "../utils/json";
import { z } from "zod";
import { readStreamToString, chainStreamables } from "../utils/stream";

// ... (schemas and types remain the same)
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
 * Generates a high-level story outline based on the provided novel details.
 * (Existing function - no changes)
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

  logger.info("Generating main outline...");
  const stream = await getChatCompletion(
    "生成主大纲",
    generationConfig,
    outlinePrompt,
    { stream: true },
  );

  if (!stream) {
    throw new Error("Failed to generate novel outline from AI service.");
  }

  logger.info("Main outline stream generated successfully.");
  return stream;
}

/**
 * Generates the next batch of detailed, chapter-by-chapter outlines.
 *
 * @param novelId - The ID of the novel.
 * @param generationConfig - The AI model configuration.
 * @param chaptersToGenerate - The number of chapters to outline in this batch.
 * @returns A structured array of detailed chapter outlines.
 */
export async function generateDetailedOutline(
  novelId: string,
  generationConfig: ModelConfig,
  chaptersToGenerate: number = 5,
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
    throw new Error(`Novel with ID ${novelId} not found.`);
  }
  const recentSummary = await summarizeRecentChapters(
    novelId,
    generationConfig,
  );
  const lastChapterNumber = novel.chapters[0]?.chapterNumber
    ? novel.chapters[0]?.chapterNumber
    : 0;

  // 3. Construct the intelligent prompt
  const detailedOutlinePrompt = `
    你是一位顶尖的小说策划师，任务是为一部正在创作中的小说生成接下来 ${chaptersToGenerate} 章的详细情节大纲。

    **绝对规则:**
    - 你的输出必须是纯粹的、格式完全正确的 JSON 数组。
    - 禁止在 JSON 内容之外包含任何文本，包括解释、注释、思考过程或任何非 JSON 字符。
    - 不要使用 Markdown 语法（如 \`\`\`json）。
    - 你的整个响应应该直接以 \`[\` 开始，并以 \`]\` 结束。

    **JSON 结构:**
    - 你的输出必须是一个 JSON 数组，数组中的每个对象代表一个章节。
    - 每个对象必须包含以下四个字段，且字段名必须完全匹配：
            1. "chapterNumber": (整数) - 章节序号，从 ${lastChapterNumber + 1} 开始连续递增。
            2. "title": (字符串) - 本章标题。
            3. "summary": (字符串) - 本章情节的简要概述。
            4. "keyEvents": (字符串数组) - 描述本章发生的关键事件、对话或场景的列表。
    - 禁止包含任何额外字段。

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

  // 4. Call AI service
  logger.info(
    `Generating detailed outline for next ${chaptersToGenerate} chapters of novel ${novelId}...`,
  );

  // 4. Call AI service with streaming
  const responseStream = await getChatCompletion(
    "生成详细大纲",
    generationConfig,
    detailedOutlinePrompt,
    { stream: true },
  );

  if (!responseStream) {
    throw new Error(
      "Failed to generate detailed outline stream from AI service.",
    );
  }

  // 5. Consume the stream and assemble the full response
  const fullResponse = await readStreamToString(responseStream);

  // 6. Validate and parse the assembled response
  try {
    // First, parse the entire response as a generic object to inspect its structure
    const rawParsed = safelyParseJson<any>(fullResponse);

    // Check if the response is nested within a 'message' property
    let potentialOutlines: unknown;
    if (typeof rawParsed.message === "string") {
      // If 'message' is a string, it might be a stringified JSON. Parse it again.
      try {
        potentialOutlines = safelyParseJson(rawParsed.message);
      } catch (e) {
        // If parsing the message fails, fall back to using the raw parsed object
        potentialOutlines = rawParsed;
      }
    } else {
      // Otherwise, assume the main object contains the data
      potentialOutlines = rawParsed;
    }

    // The actual outlines might be at the top level, or nested under an 'outlines' key
    const validation = detailedOutlineBatchSchema.safeParse(potentialOutlines);

    if (!validation.success) {
      logger.error(
        "AI response validation failed:",
        validation.error.flatten(),
      );
      throw new Error(
        `AI returned a detailed outline in an unexpected format. Raw response: ${fullResponse}`,
      );
    }

    logger.info("Detailed outline generated and validated successfully.");
    return validation.data;
  } catch (error) {
    logger.error("Error parsing or validating AI response:", error);
    throw new Error(
      `Failed to parse the detailed outline from AI response. Raw response: ${fullResponse}`,
    );
  }
}
