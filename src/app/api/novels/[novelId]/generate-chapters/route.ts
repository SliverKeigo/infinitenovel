import logger from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ModelConfig } from "@/types/ai";
import { generateDetailedOutline } from "@/lib/generation/outline";

const generationRequestBodySchema = z.object({
  generationConfig: z.custom<ModelConfig>((val) => {
    return (
      typeof val === "object" &&
      val !== null &&
      "apiKey" in val &&
      "model" in val
    );
  }, "必须提供有效的生成模型配置。"),
  chaptersToGenerate: z.number().int().positive().optional().default(5),
});

interface PostParams {
  params: {
    novelId: string;
  };
}

/**
 * 处理 POST 请求，为小说生成并保存新的一批详细大纲。
 */
export async function POST(request: Request, { params }: PostParams) {
  try {
    const { novelId } = params;

    // 1. 验证请求体
    const body = await request.json();
    const validation = generationRequestBodySchema.safeParse(body);

    if (!validation.success) {
      return new NextResponse(
        JSON.stringify({
          error: "无效的请求体",
          details: validation.error.flatten(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { generationConfig, chaptersToGenerate } = validation.data;

    logger.info(
      `收到为小说 ${novelId} 生成 ${chaptersToGenerate} 个章节大纲的请求。`,
    );

    // 2. 调用生成服务
    const detailedOutlines = await generateDetailedOutline(
      novelId,
      generationConfig,
      chaptersToGenerate,
    );

    // 3. 将生成的大纲保存到数据库
    // 如果已存在详细大纲，我们会追加到现有大纲中
    await prisma.novel.update({
      where: { id: novelId },
      data: {
        detailedOutline: {
          push: detailedOutlines,
        },
      },
    });

    logger.info(`已成功为小说 ${novelId} 生成并保存新大纲。`);

    // 4. 返回新生成的大纲
    return NextResponse.json(detailedOutlines, { status: 201 });
  } catch (error) {
    logger.error(
      { err: error, novelId },
      `在 POST /api/novels/[novelId]/generate-chapters 中发生错误`,
    );
    const errorMessage =
      error instanceof Error ? error.message : "发生内部服务器错误。";
    return new NextResponse(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
