import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/novels/[id]
 * 获取单本小说
 */
export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const id = parseInt(context.params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }
    const result = await query('SELECT * FROM novels WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`Failed to fetch novel ${context.params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PUT /api/novels/[id]
 * 更新一本小说
 */
export async function PUT(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const id = parseInt(context.params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }
    const body = await request.json();
    
    // Dynamically build the update query
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

    // Add the novel ID to the values array for the WHERE clause
    values.push(id);
    
    const updateQuery = `
      UPDATE novels
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${fieldIndex}
      RETURNING *;
    `;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`Failed to update novel ${context.params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/novels/[id]
 * 删除一本小说
 */
export async function DELETE(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const id = parseInt(context.params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    // The ON DELETE CASCADE in the database schema will handle related entities.
    const result = await query('DELETE FROM novels WHERE id = $1 RETURNING *;', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    return NextResponse.json({ message: `Novel with id ${id} deleted successfully.` });
  } catch (error) {
    console.error(`Failed to delete novel ${context.params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 