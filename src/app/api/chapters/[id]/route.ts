import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/chapters/[id]
 * 获取单个章节
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }
    const result = await query('SELECT * FROM chapters WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`Failed to fetch chapter ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PUT /api/chapters/[id]
 * 更新一个章节
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }
    const body = await request.json();
    
    const fields = [];
    const values = [];
    let fieldIndex = 1;

    for (const [key, value] of Object.entries(body)) {
      fields.push(`${key} = $${fieldIndex++}`);
      values.push(value);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    
    const updateQuery = `
      UPDATE chapters
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${fieldIndex}
      RETURNING *;
    `;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`Failed to update chapter ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/chapters/[id]
 * 删除一个章节
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const result = await query('DELETE FROM chapters WHERE id = $1 RETURNING *;', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    return NextResponse.json({ message: `Chapter with id ${id} deleted successfully.` });
  } catch (error) {
    console.error(`Failed to delete chapter ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 