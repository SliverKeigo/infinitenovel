import logger from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ModelConfig } from "@/types/ai";
import {
  generateInitialWorldElements,
  saveInitialWorldElements,
} from "@/lib/generation/world";
import { generateStyleAndTone } from "@/lib/generation/style";
import {
  generateMainOutline,
  generateDetailedOutline,
} from "@/lib/generation/outline";

const novelCreationRequestSchema = z.object({
  title: z.string().min(2, "标题必须至少为 2 个字符。"),
  summary: z.string().min(10, "摘要必须至少为 10 个字符。"),
  presetChapters: z.number().int().positive("预设章节数必须为正整数。"),
  category: z.string().min(1, "分类是必填项。"),
  subCategory: z.string().min(1, "子分类是必填项。"),
  generationConfig: z.custom<ModelConfig>((val) => {
    return (
      typeof val === "object" &&
      val !== null &&
      "apiKey" in val &&
      "model" in val
    );
  }, "必须提供有效的生成模型配置。"),
  embeddingConfig: z.custom<ModelConfig>((val) => {
    return (
      typeof val === "object" &&
      val !== null &&
      "apiKey" in val &&
      "model" in val
    );
  }, "必须提供有效的向量模型配置。"),
});

/**
 * 处理新小说的创建，包括生成主大纲和初始的详细章节大纲。
 */
export async function POST(request: Request) {
  try {
    // 1. 验证请求体
    const body = await request.json();
    const validation = novelCreationRequestSchema.safeParse(body);

    if (!validation.success) {
      return new NextResponse(
        JSON.stringify({
          error: "无效的请求体",
          details: validation.error.flatten(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const {
      title,
      summary,
      category,
      subCategory,
      presetChapters,
      generationConfig,
      embeddingConfig,
    } = validation.data;

    // 2. 生成写作风格和基调
    const { style, tone } = await generateStyleAndTone(
      title,
      summary,
      generationConfig,
    );

    // 3. 在已知风格和基调的情况下，生成主大纲
    const mainOutline = await generateMainOutline(
      title,
      summary,
      category,
      subCategory,
      presetChapters,
      style,
      tone,
      generationConfig,
    );

    // 4. 在数据库中创建小说基础记录
    const newNovel = await prisma.novel.create({
      data: {
        title,
        summary,
        type: `${category} / ${subCategory}`,
        presetChapters,
        outline: mainOutline,
        style,
        tone,
      },
    });
    logger.info(`小说已创建，ID: ${newNovel.id}。`);

    // 5. 生成详细开篇大纲
    const initialDetailedOutline = await generateDetailedOutline(
      newNovel.id,
      generationConfig,
    );

    // 6. 生成初始世界构建元素
    logger.info(`开始为小说 ${newNovel.id} 生成初始世界元素...`);
    const worldElements = await generateInitialWorldElements(
      mainOutline,
      initialDetailedOutline,
      generationConfig,
    );
    logger.info(`小说 ${newNovel.id} 的初始世界元素生成完成。`);

    // 7. 保存世界元素并更新详细大纲
    logger.info(`正在为小说 ${newNovel.id} 保存初始世界元素并更新大纲...`);
    await saveInitialWorldElements(newNovel.id, worldElements, embeddingConfig);

    const fullyInitializedNovel = await prisma.novel.update({
      where: { id: newNovel.id },
      data: {
        detailedOutline: initialDetailedOutline,
      },
    });
    logger.info(`小说 ${newNovel.id} 已完全初始化。`);

    // 8. 返回完全初始化的小说对象
    return NextResponse.json(fullyInitializedNovel, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "在 POST /api/novels 中发生错误");
    const errorMessage =
      error instanceof Error ? error.message : "发生内部服务器错误。";
    return new NextResponse(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
