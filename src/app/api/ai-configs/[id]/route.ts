import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/ai-configs/[id]
 * 获取单个AI配置
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
    const result = await query('SELECT * FROM ai_configs WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'AI config not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`Failed to fetch AI config ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PUT /api/ai-configs/[id]
 * 更新一个AI配置
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

    // 定义允许更新的字段列表
    const allowedFields = [
      'name', 
      'api_key', 
      'api_base_url', 
      'model', 
      'vision_model',
      'use_api_for_embeddings',
      'embedding_model',
      'use_independent_embedding_config',
      'embedding_api_key',
      'embedding_api_base_url'
    ];
    
    const fields = [];
    const values = [];
    let fieldIndex = 1;

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        fields.push(`${key} = $${fieldIndex++}`);
        values.push(body[key]);
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    values.push(id);
    
    const updateQuery = `
      UPDATE ai_configs
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${fieldIndex}
      RETURNING *;
    `;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'AI config not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`Failed to update AI config ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/ai-configs/[id]
 * 删除一个AI配置
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

    const result = await query('DELETE FROM ai_configs WHERE id = $1 RETURNING *;', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'AI config not found' }, { status: 404 });
    }

    return NextResponse.json({ message: `AI config with id ${id} deleted successfully.` });
  } catch (error) {
    console.error(`Failed to delete AI config ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 