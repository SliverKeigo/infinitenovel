import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/novels
 * 获取所有小说
 */
export async function GET() {
  try {
    const result = await query('SELECT * FROM novels ORDER BY updated_at DESC');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch novels:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/novels
 * 创建一本新小说
 */
export async function POST(request: Request) {
  try {
    const { 
      name, 
      genre, 
      style, 
      description,
      initialChapterGoal,
      totalChapterGoal,
      specialRequirements
    } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const insertQuery = `
      INSERT INTO novels (name, genre, style, description, initial_chapter_goal, total_chapter_goal, special_requirements)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [
      name, 
      genre || '科幻', 
      style || '硬核', 
      description || '',
      initialChapterGoal || 1,
      totalChapterGoal || 100,
      specialRequirements || ''
    ];

    const result = await query(insertQuery, values);
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Failed to create novel:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 