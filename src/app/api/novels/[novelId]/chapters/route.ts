import logger from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ModelConfig } from "@/types/ai";
import { generateNextChapter } from "@/lib/generation/chapter";
import { prisma } from "@/lib/prisma";

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
  count: z.number().int().min(1).optional().default(1),
});

/**
 * 处理为小说生成下一章节的 POST 请求。
 * 这是迭代生成循环的核心端点。
 */
export async function POST(
  request: Request,
  context: { params: { novelId: string } },
) {
  const { novelId } = context.params;

  try {

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

    const { generationConfig, embeddingConfig, stream, count } =
      validation.data;
    logger.info(
      `收到为小说 ${novelId} 生成 ${count} 章的请求 (stream: ${stream})。`,
    );

    // 2. 调用核心服务函数
    const result = await generateNextChapter(
      novelId,
      generationConfig,
      embeddingConfig,
      { stream, count },
    );

    // 3. 根据结果类型返回响应
    if (result instanceof Response) {
      return result;
    } else {
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

/**
 * 处理分页获取小说章节列表的 GET 请求。
 */
export async function GET(
  request: Request,
  context: { params: { novelId: string } },
) {
  const { novelId } = context.params;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "10", 10);

  if (isNaN(page) || page < 1) {
    return NextResponse.json({ error: "无效的页码。" }, { status: 400 });
  }
  if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
    return NextResponse.json(
      { error: "无效的页面大小。必须在 1 到 100 之间。" },
      { status: 400 },
    );
  }

  const skip = (page - 1) * pageSize;

  try {
    const [chapters, totalChapters] = await prisma.$transaction([
      prisma.novelChapter.findMany({
        where: { novelId },
        orderBy: { chapterNumber: "asc" },
        skip: skip,
        take: pageSize,
      }),
      prisma.novelChapter.count({
        where: { novelId },
      }),
    ]);

    return NextResponse.json({
      chapters,
      totalChapters,
      totalPages: Math.ceil(totalChapters / pageSize),
      currentPage: page,
    });
  } catch (error) {
    logger.error(
      { err: error, novelId },
      `在 GET /api/novels/[novelId]/chapters 路由中发生错误`,
    );
    return NextResponse.json(
      { error: "获取章节列表时发生内部服务器错误。" },
      { status: 500 },
    );
  }
}
