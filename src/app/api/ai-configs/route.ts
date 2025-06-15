import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/ai-configs
 * 获取所有AI配置
 */
export async function GET() {
  try {
    const result = await query('SELECT * FROM ai_configs ORDER BY created_at ASC');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch AI configs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/ai-configs
 * 创建一个新AI配置
 */
export async function POST(request: Request) {
  try {
    const { name, api_key, api_base_url, model, vision_model } = await request.json();
    if (!name || !api_key || !model) {
      return NextResponse.json({ error: 'name, api_key, and model are required' }, { status: 400 });
    }

    const insertQuery = `
      INSERT INTO ai_configs (name, api_key, api_base_url, model, vision_model)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [name, api_key, api_base_url || '', model, vision_model || ''];

    const result = await query(insertQuery, values);
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Failed to create AI config:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 