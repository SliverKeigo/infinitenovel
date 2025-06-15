import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/plot-clues/[id]
 * 获取单个情节线索
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
    const result = await query('SELECT * FROM plot_clues WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Plot clue not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`Failed to fetch plot clue ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PUT /api/plot-clues/[id]
 * 更新一个情节线索
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
      UPDATE plot_clues
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${fieldIndex}
      RETURNING *;
    `;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Plot clue not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`Failed to update plot clue ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/plot-clues/[id]
 * 删除一个情节线索
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

    const result = await query('DELETE FROM plot_clues WHERE id = $1 RETURNING *;', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Plot clue not found' }, { status: 404 });
    }

    return NextResponse.json({ message: `Plot clue with id ${id} deleted successfully.` });
  } catch (error) {
    console.error(`Failed to delete plot clue ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 