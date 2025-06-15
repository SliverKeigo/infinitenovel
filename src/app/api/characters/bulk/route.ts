import { NextResponse } from 'next/server';
import { query } from '@/lib/pg-db';
import type { Character } from '@/types/character';

export async function POST(req: Request) {
  try {
    const { characters, novelId } = await req.json();

    if (!Array.isArray(characters) || characters.length === 0 || !novelId) {
      return NextResponse.json({ error: 'characters array and novelId are required' }, { status: 400 });
    }

    // 构建批量插入的查询
    const values: any[] = [];
    const rows: string[] = [];
    let paramIndex = 1;

    characters.forEach((char: any) => {
      const rowValues = [
        novelId,
        char.name,
        char.core_setting,
        char.personality,
        char.background_story,
        char.appearance,
        char.relationships || '',
        char.is_protagonist || false,
        char.status || 'active',
        char.description || ''
      ];
      
      const params = rowValues.map(() => `$${paramIndex++}`);
      rows.push(`(${params.join(', ')})`);
      values.push(...rowValues);
    });

    const queryString = `
      INSERT INTO characters (
        novel_id, name, core_setting, personality, background_story, 
        appearance, relationships, is_protagonist, status, description
      ) VALUES ${rows.join(', ')}
      RETURNING *;
    `;

    const result = await query(queryString, values);

    return NextResponse.json(result.rows, { status: 201 });
  } catch (error) {
    console.error('Failed to bulk insert characters:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: 'Failed to create characters', details: errorMessage }, { status: 500 });
  }
}
