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
import { CHAPTER_GENERATION_PROMPT } from "@/lib/prompts/chapter.prompts";
import { interpolatePrompt } from "@/lib/utils/prompt";

const Status = {
  DETERMINING_CHAPTER_NUMBER: "正在确定章节序号...",
  GENERATING_OUTLINE: (chapterNumber: number) =>
    `正在生成第 ${chapterNumber} 章的详细大纲...`,
  RETRIEVING_CONTEXT: "正在从记忆库检索相关信息...",
  AI_CREATING: "AI 正在创作中，请稍候...",
};

function sendStatusUpdate(
  controller: ReadableStreamDefaultController<Uint8Array>,
  message: string,
) {
  const encoder = new TextEncoder();
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({ type: "status", message })}\\n\\n`,
    ),
  );
}

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

export async function generateNextChapter(
  novelId: string,
  generationConfig: ModelConfig,
  embeddingConfig: ModelConfig,
  options: { stream?: boolean } = {},
): Promise<Response | NovelChapter> {
  if (options.stream) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          sendStatusUpdate(controller, Status.DETERMINING_CHAPTER_NUMBER);
          const lastChapter = await prisma.novelChapter.findFirst({
            where: { novelId },
            orderBy: { chapterNumber: "desc" },
          });
          const nextChapterNumber = lastChapter
            ? lastChapter.chapterNumber + 1
            : 1;

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

          const contentGenerationPrompt = buildChapterPrompt(
            novel,
            detailedOutline,
            context,
            previousChapterContent,
            nextChapterNumber,
          );

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

          (async () => {
            try {
              const reader = streamForDb.getReader();
              const decoder = new TextDecoder();
              let fullContent = "";
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                fullContent += decoder.decode(value, { stream: true });
              }
              fullContent += decoder.decode();

              logger.info(`[数据库流] 完整内容长度: ${fullContent.length}`);
              if (fullContent.trim() === "") {
                logger.error(
                  "[数据库流] AI在所有重试后返回了空内容。正在中止保存。",
                );
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "error",
                      message: "AI未能生成章节内容，请稍后重试。",
                    })}\\n\\n`,
                  ),
                );
                return;
              }

              await prisma.$transaction(async (tx) => {
                await tx.novelChapter.create({
                  data: {
                    novelId,
                    title: detailedOutline.title,
                    chapterNumber: nextChapterNumber,
                    content: fullContent,
                  },
                });
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

          const reader = streamForClient.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "content",
                  chunk: new TextDecoder().decode(value),
                })}\\n\\n`,
              ),
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "出现未知服务器错误";
          logger.error({
            msg: "章节生成流中捕获到未处理的错误",
            novelId,
            err:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error,
          });
          const clientErrorMessage = `章节生成失败: ${errorMessage}`;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: clientErrorMessage,
              })}\\n\\n`,
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
  throw new Error("Non-streaming implementation is not yet supported.");
}

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
  const novelSelect = {
    id: true,
    title: true,
    summary: true,
    type: true,
    outline: true,
    detailedOutline: true,
    storySoFarSummary: true,
    presetChapters: true,
    currentWordCount: true,
    createdAt: true,
    updatedAt: true,
    style: true,
    tone: true,
  };
  let novelData = await prisma.novel.findUnique({
    where: { id: novelId },
    select: novelSelect,
  });
  if (!novelData) throw new Error("找不到指定的小说。");
  let novel: Novel = novelData as Novel;
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
    const updatedNovelData = await prisma.novel.update({
      where: { id: novelId },
      data: { detailedOutline: existingOutlines },
      select: novelSelect,
    });
    novel = updatedNovelData as Novel;
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
  novel: Novel,
  detailedOutline: DetailedChapterOutline,
  context: string,
  previousChapterContent: string,
  nextChapterNumber: number,
): string {
  // 准备一个与新版 "网文大神" prompt 完全对应的键值对对象
  const promptValues = {
    title: novel.title,
    type: novel.type,
    style: novel.style || "暂未设定",
    tone: novel.tone || "暂未设定",
    nextChapterNumber: String(nextChapterNumber),
    detailedOutlineTitle: detailedOutline.title,
    detailedOutlineSummary: detailedOutline.summary,
    detailedOutlineKeyEvents: detailedOutline.keyEvents
      .map((event) => `- ${event}`)
      .join("\n"),
    previousChapterContent,
    context,
  };

  // 使用通用插值函数
  return interpolatePrompt(CHAPTER_GENERATION_PROMPT, promptValues);
}
