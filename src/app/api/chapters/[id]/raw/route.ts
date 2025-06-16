import { NextResponse } from 'next/server';
import { query } from '@/lib/pg-db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const chapterId = parseInt(params.id, 10);
    if (isNaN(chapterId)) {
      return NextResponse.json({ error: '无效的章节ID' }, { status: 400 });
    }

    const sql = `SELECT id, novel_id, content, md5(content) AS content_hash FROM chapters WHERE id = $1 LIMIT 1`;
    const result = await query(sql, [chapterId]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: '章节未找到' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`[API] 获取章节 ${params.id} 正文失败:`, error);
    return NextResponse.json({ error: '获取章节正文失败' }, { status: 500 });
  }
} 