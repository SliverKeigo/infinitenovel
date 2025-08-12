import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";

export async function GET(
  request: Request,
  context: { params: { novelId: string; chapterId: string } }
) {
  const { novelId, chapterId } = context.params;

  if (!novelId || !chapterId) {
    return NextResponse.json(
      { error: "小说ID和章节ID是必需的。" },
      { status: 400 }
    );
  }

  try {
    const chapter = await prisma.novelChapter.findUnique({
      where: {
        id: chapterId,
        novelId: novelId,
      },
    });

    if (!chapter) {
      return NextResponse.json({ error: "找不到指定的章节。" }, { status: 404 });
    }

    return NextResponse.json(chapter);
  } catch (error) {
    logger.error(
      {
        err: error,
        novelId,
        chapterId,
      },
      `在 GET /api/novels/[novelId]/chapters/[chapterId] 路由中发生错误`
    );
    return NextResponse.json(
      { error: "获取章节内容时发生内部服务器错误。" },
      { status: 500 }
    );
  }
}
