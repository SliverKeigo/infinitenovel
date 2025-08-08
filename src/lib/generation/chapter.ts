import { Novel, NovelChapter } from "@prisma/client";
import logger from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ModelConfig } from "@/types/ai";
import {
  generateDetailedOutline,
  DetailedChapterOutline,
  detailedOutlineBatchSchema,
} from "./outline";
import { evolveWorldFromChapter } from "./world";
import { queryCollection } from "../vector-store";
import { getChatCompletion } from "@/lib/ai-client";
import { log } from "node:console";

const Status = {
  DETERMINING_CHAPTER_NUMBER: "正在确定章节序号...",
  GENERATING_OUTLINE: (chapterNumber: number) =>
    `正在生成第 ${chapterNumber} 章的详细大纲...`,
  RETRIEVING_CONTEXT: "正在从记忆库检索相关信息...",
  AI_CREATING: "AI 正在创作中，请稍候...",
};

// 通过流发送状态更新的辅助函数
function sendStatusUpdate(
  controller: ReadableStreamDefaultController<Uint8Array>,
  message: string,
) {
  const encoder = new TextEncoder();
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ type: "status", message })}

`),
  );
}

// 重载签名
export async function generateNextChapter(
  novelId: string,
  generationConfig: ModelConfig,
  embeddingConfig: ModelConfig,
  options: { stream: true },
): Promise<Response>;

export async function generateNextChapter(
  novelId: string,
  generationConfig: ModelConfig,
  embeddingConfig: ModelConfig,
  options?: { stream?: false },
): Promise<NovelChapter>;

// 实现
export async function generateNextChapter(
  novelId: string,
  generationConfig: ModelConfig,
  embeddingConfig: ModelConfig,
  options: { stream?: boolean } = {},
): Promise<Response | NovelChapter> {
  // 对于流式响应，我们创建一个新的 ReadableStream
  if (options.stream) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          // 1. 确定下一章节编号
          sendStatusUpdate(controller, Status.DETERMINING_CHAPTER_NUMBER);
          const lastChapter = await prisma.novelChapter.findFirst({
            where: { novelId },
            orderBy: { chapterNumber: "desc" },
          });
          const nextChapterNumber = lastChapter
            ? lastChapter.chapterNumber + 1
            : 1;

          // 步骤2和3现在被封装在一个专用的 try-catch 块中
          // 以便进行更精细的错误报告。
          const { novel, detailedOutline, context } =
            await getOutlineAndContext(
              novelId,
              nextChapterNumber,
              generationConfig,
              embeddingConfig,
              controller,
            );

          const previousChapterContent = lastChapter
            ? `
这是小说的上一章内容，请确保新章节与它衔接流畅:
---
${lastChapter.content}
---
`
            : "这是第一章。";

          // 4. 构建最终的提示
          const contentGenerationPrompt = buildChapterPrompt(
            novel,
            detailedOutline,
            context,
            previousChapterContent,
            nextChapterNumber,
          );

          // 5. 通过流生成章节内容
          sendStatusUpdate(controller, Status.AI_CREATING);
          const contentStream = await getChatCompletion(
            "生成章节内容",
            generationConfig,
            contentGenerationPrompt,
            { ...generationConfig.options, stream: true },
          );

          if (!contentStream)
            throw new Error("AI 服务未能成功生成章节内容流。");

          const [streamForClient, streamForDb] = contentStream.tee();

          // 后台任务，处理并保存完整内容
          (async () => {
            try {
              let fullContent = "";
              const reader = streamForDb.getReader();
              logger.info("[数据库流] 开始从AI流中读取数据以供数据库保存...");
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  logger.info("[数据库流] 流已结束。");
                  break;
                }
                const decodedChunk = new TextDecoder().decode(value);
                logger.info(`[数据库流] 正在保存数据: ${decodedChunk}`);
                fullContent += decodedChunk;
              }

              logger.info(`[数据库流] 完整内容长度: ${fullContent.length}`);
              if (fullContent.trim() === "") {
                logger.error(
                  "[数据库流] AI返回了空或仅包含空白的内容。正在中止保存。",
                );
                return; // 防止保存空章节
              }

              await prisma.$transaction(async (tx) => {
                // 1. 创建新章节
                await tx.novelChapter.create({
                  data: {
                    novelId,
                    title: detailedOutline.title,
                    chapterNumber: nextChapterNumber,
                    content: fullContent,
                  },
                });

                // 2. 更新小说总字数
                const wordCount = fullContent.length;
                await tx.novel.update({
                  where: { id: novelId },
                  data: {
                    currentWordCount: {
                      increment: wordCount,
                    },
                  },
                });

                logger.info(
                  `小说 ${novelId} 的总字数已更新，增加 ${wordCount} 字。`,
                );
              });

              // 3. 异步进行世界观演化
              await evolveWorldFromChapter(
                novelId,
                fullContent,
                generationConfig,
                embeddingConfig,
              );
              logger.info(
                `后台任务完成: 已保存并演化了第 ${nextChapterNumber} 章。`,
              );
            } catch (e) {
              logger.error({
                msg: `后台为小说 ${novelId} 保存第 ${nextChapterNumber} 章并进行世界观演化时失败`,
                err:
                  e instanceof Error
                    ? { message: e.message, stack: e.stack }
                    : e,
              });
            }
          })();

          // 将内容流传输到客户端
          const reader = streamForClient.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "content", chunk: new TextDecoder().decode(value) })}`,
              ),
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "出现未知服务器错误";
          // 记录结构化错误日志，便于问题追踪
          logger.error({
            msg: "章节生成流中捕获到未处理的错误",
            novelId,
            err:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error,
          });
          // 向客户端发送一个更友好的错误信息
          const clientErrorMessage = `章节生成失败: ${errorMessage}`;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: clientErrorMessage })}

`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }
}

// 此函数现在可以被移除，因为其逻辑已包含在后台任务中。
// async function readStreamToString(stream: ReadableStream): Promise<string> { ... }

async function getOutlineAndContext(
  novelId: string,
  nextChapterNumber: number,
  generationConfig: ModelConfig,
  embeddingConfig: ModelConfig,
  controller: ReadableStreamDefaultController<Uint8Array>,
) {
  try {
    const { novel, detailedOutline } = await getOrCreateChapterOutline(
      novelId,
      nextChapterNumber,
      generationConfig,
      controller,
    );

    const context = await getChapterContext(
      novelId,
      detailedOutline,
      embeddingConfig,
      controller,
    );

    logger.info(`小说相关上下文 ${context}`);

    return { novel, detailedOutline, context };
  } catch (error) {
    // 将特定错误转发到主 catch 块
    throw new Error(
      `获取大纲或上下文时出错: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function getOrCreateChapterOutline(
  novelId: string,
  chapterNumber: number,
  generationConfig: ModelConfig,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<{ novel: Novel; detailedOutline: DetailedChapterOutline }> {
  let novel = await prisma.novel.findUnique({ where: { id: novelId } });
  if (!novel) throw new Error("找不到指定的小说。");

  const parseResult = detailedOutlineBatchSchema.safeParse(
    novel.detailedOutline,
  );
  const existingOutlines = parseResult.success ? parseResult.data : [];

  let detailedOutline: DetailedChapterOutline | undefined =
    existingOutlines.find((o) => o.chapterNumber === chapterNumber);

  if (!detailedOutline) {
    sendStatusUpdate(controller, Status.GENERATING_OUTLINE(chapterNumber));
    const newOutlines = await generateDetailedOutline(
      novelId,
      generationConfig,
    );
    existingOutlines.push(...newOutlines);
    novel = await prisma.novel.update({
      where: { id: novelId },
      data: { detailedOutline: existingOutlines },
    });
    detailedOutline = existingOutlines.find(
      (o) => o.chapterNumber === chapterNumber,
    );
    if (!detailedOutline) {
      throw new Error(
        `续订大纲后，仍然无法为第 ${chapterNumber} 章找到有效的大纲。`,
      );
    }
  }
  return { novel, detailedOutline };
}

async function getChapterContext(
  novelId: string,
  detailedOutline: DetailedChapterOutline,
  embeddingConfig: ModelConfig,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<string> {
  sendStatusUpdate(controller, Status.RETRIEVING_CONTEXT);
  const queryText = `第${detailedOutline.chapterNumber}章: ${detailedOutline.title}。摘要: ${detailedOutline.summary}`;
  const [rolesContext, scenesContext, cluesContext] = await Promise.all([
    queryCollection(`novel_${novelId}_roles`, queryText, embeddingConfig),
    queryCollection(`novel_${novelId}_scenes`, queryText, embeddingConfig),
    queryCollection(`novel_${novelId}_clues`, queryText, embeddingConfig),
  ]);

  return `
  ### 相关角色:${rolesContext.join("") || "无"}

### 相关场景:
${scenesContext.join("") || "无"}

### 相关线索:
${cluesContext.join("") || "无"}
`;
}

function buildChapterPrompt(
  novel: Novel, // Prisma.Novel 类型
  detailedOutline: DetailedChapterOutline,
  context: string,
  previousChapterContent: string,
  nextChapterNumber: number,
): string {
  return `
你是一位才华横溢的小说家。你的任务是根据我提供的小说背景、世界观、上下文和具体章节大纲，创作出精彩的章节内容。

**小说信息:**
*   **标题:** ${novel.title}
*   **类型:** ${novel.type}
*   **核心摘要:** ${novel.summary}

**写作风格和基调:**
*   **风格:** ${novel.style}
*   **基调:** ${novel.tone}

**章节创作任务:**
*   **当前章节:** 第 ${nextChapterNumber} 章
*   **章节标题:** ${detailedOutline.title}
*   **章节大纲:** ${detailedOutline.summary}
*   **关键事件:**
    ${detailedOutline.keyEvents.map((event) => `- ${event}`).join("")}

**上下文参考:**
${context}

**前情提要:**
${previousChapterContent}

**写作要求:**
1.  严格遵循以上提供的章节大纲和关键事件进行创作，不得偏离。
2.  文笔优美，叙事流畅，情感真挚，富有感染力。
3.  确保内容与小说整体风格、基调以及前一章内容保持一致。
4.  只输出章节的正文内容，不要包含任何标题、章节号或其他额外说明。
5.  如果这是第一章，请确保开篇引人入胜。
`;
}
