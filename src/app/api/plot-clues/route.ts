import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/plot-clues?novel_id=[id]
 * 获取某本小说的所有情节线索
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

    const result = await query('SELECT * FROM plot_clues WHERE novel_id = $1 ORDER BY created_at ASC', [id]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch plot clues:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/plot-clues
 * 创建一个新线索
 */
export async function POST(request: Request) {
  try {
    const { novel_id, title, description, status } = await request.json();
    if (!novel_id || !title) {
      return NextResponse.json({ error: 'novel_id and title are required' }, { status: 400 });
    }

    const insertQuery = `
      INSERT INTO plot_clues (novel_id, title, description, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [novel_id, title, description || '', status || '未解决'];

    const result = await query(insertQuery, values);
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Failed to create plot clue:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 