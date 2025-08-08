import logger from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ModelConfig } from "@/types/ai";
import { generateNextChapter } from "@/lib/generation/chapter";

export const runtime = "nodejs"; // 强制使用 Node.js 运行时

// 定义请求体验证 schema，现在需要两种模型配置
const chapterGenerationRequestSchema = z.object({
  generationConfig: z.custom<ModelConfig>(
    (val) => val !== null && typeof val === "object" && "apiKey" in val,
    "必须提供有效的文本生成模型配置。",
  ),
  embeddingConfig: z.custom<ModelConfig>(
    (val) => val !== null && typeof val === "object" && "apiKey" in val,
    "必须提供有效的向量模型配置。",
  ),
  stream: z.boolean().optional().default(false),
});

/**
 * 处理为小说生成下一章节的 POST 请求。
 * 这是迭代生成循环的核心端点。
 */
export async function POST(
  request: Request,
  context: { params: { novelId: string } },
) {
  try {
    const params = context.params;
    const { novelId } = params;

    // 1. 验证请求体
    const body = await request.json();
    const validation = chapterGenerationRequestSchema.safeParse(body);

    if (!validation.success) {
      return new NextResponse(
        JSON.stringify({
          error: "无效的请求体",
          details: validation.error.flatten(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { generationConfig, embeddingConfig, stream } = validation.data;
    logger.info(`收到为小说 ${novelId} 生成下一章的请求 (stream: ${stream})。`);

    // 2. 调用核心服务函数
    // 函数是重载的，会根据 stream 参数返回不同类型的结果
    const result = await generateNextChapter(
      novelId,
      generationConfig,
      embeddingConfig,
      { stream },
    );

    // 3. 根据结果类型返回响应
    if (result instanceof Response) {
      // 如果是流式响应，直接返回
      return result;
    } else {
      // 如果是完整的章节对象，用 JSON 格式返回
      return NextResponse.json(result, { status: 201 });
    }
  } catch (error) {
    logger.error(
      { err: error, novelId },
      `在 POST /api/novels/[novelId]/chapters 路由中发生错误`,
    );
    const errorMessage =
      error instanceof Error ? error.message : "发生了一个内部服务器错误。";
    return new NextResponse(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
