import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/chapters?novel_id=[id]
 * 获取某本小说的所有章节
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const novelId = searchParams.get('novel_id');

    if (!novelId) {
      return NextResponse.json({ error: 'novel_id is required' }, { status: 400 });
    }
    const id = parseInt(novelId, 10);
    if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid novel_id' }, { status: 400 });
    }

    const result = await query('SELECT * FROM chapters WHERE novel_id = $1 ORDER BY chapter_number ASC', [id]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch chapters:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/chapters
 * 创建一个新章节
 */
export async function POST(request: Request) {
  try {
    const { novel_id, chapter_number, title, content, summary } = await request.json();
    if (!novel_id || !chapter_number || !title) {
      return NextResponse.json({ error: 'novel_id, chapter_number, and title are required' }, { status: 400 });
    }

    const insertQuery = `
      INSERT INTO chapters (novel_id, chapter_number, title, content, summary)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [novel_id, chapter_number, title, content || '', summary || ''];

    const result = await query(insertQuery, values);
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Failed to create chapter:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 