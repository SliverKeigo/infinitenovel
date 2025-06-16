import { NextResponse } from 'next/server';
import { query } from '@/lib/pg-db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const novelId = parseInt(params.id, 10);
    if (isNaN(novelId)) {
      return NextResponse.json({ error: '无效的小说ID' }, { status: 400 });
    }

    const chaptersQuery = 'SELECT * FROM chapters WHERE novel_id = $1';
    const charactersQuery = 'SELECT * FROM characters WHERE novel_id = $1';
    const plotCluesQuery = 'SELECT * FROM plot_clues WHERE novel_id = $1';

    const [chaptersResult, charactersResult, plotCluesResult] = await Promise.all([
      query(chaptersQuery, [novelId]),
      query(charactersQuery, [novelId]),
      query(plotCluesQuery, [novelId]),
    ]);

    return NextResponse.json({
      chapters: chaptersResult.rows,
      characters: charactersResult.rows,
      plotClues: plotCluesResult.rows,
    });
  } catch (error) {
    console.error(`[API] 获取ID为 ${params.id} 的RAG内容失败:`, error);
    return NextResponse.json(
      { error: '获取小说内容失败' },
      { status: 500 }
    );
  }
} 