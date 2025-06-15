import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/characters?novel_id=[id]
 * 获取某本小说的所有角色
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

    const result = await query('SELECT * FROM characters WHERE novel_id = $1 ORDER BY created_at ASC', [id]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch characters:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/characters
 * 创建一个新角色
 */
export async function POST(request: Request) {
  try {
    const { novel_id, name, core_setting, personality, background_story, avatar } = await request.json();
    if (!novel_id || !name) {
      return NextResponse.json({ error: 'novel_id and name are required' }, { status: 400 });
    }

    const insertQuery = `
      INSERT INTO characters (novel_id, name, core_setting, personality, background_story, avatar)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [novel_id, name, core_setting || '', personality || '', background_story || '', avatar || ''];

    const result = await query(insertQuery, values);
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Failed to create character:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 