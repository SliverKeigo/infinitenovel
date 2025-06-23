import { NextResponse } from 'next/server';
import { query } from '@/lib/pg-db';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const configId = parseInt(params.id, 10);
  if (isNaN(configId)) {
    return NextResponse.json({ error: 'Invalid config ID' }, { status: 400 });
  }

  try {
    // 在一个事务中执行更新，确保原子性
    await query('BEGIN');
    // 首先，将所有配置的状态重置为 'inactive'
    await query("UPDATE ai_configs SET status = 'inactive'");
    // 然后，将指定的配置状态设置为 'active'
    const result = await query(
      "UPDATE ai_configs SET status = 'active' WHERE id = $1 RETURNING *",
      [configId]
    );
    await query('COMMIT');

    if (result.rows.length === 0) {
      await query('ROLLBACK');
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    await query('ROLLBACK');
    console.error(`[API] Error activating AI config ${configId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
} 