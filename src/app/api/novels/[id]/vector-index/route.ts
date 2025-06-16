import { getDbPool } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/novels/[id]/vector-index
 * 获取小说的向量索引
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const pool = getDbPool();
  const client = await pool.connect();
  
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid novel ID' }, { status: 400 });
    }

    const result = await client.query(
      'SELECT index_dump FROM novel_vector_indices WHERE novel_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Vector index not found' }, { status: 404 });
    }

    // 返回二进制数据
    return new NextResponse(result.rows[0].index_dump, {
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });
  } catch (error) {
    console.error('Failed to fetch vector index:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    client.release();
  }
}

/**
 * PUT /api/novels/[id]/vector-index
 * 更新或创建小说的向量索引
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const pool = getDbPool();
  const client = await pool.connect();
  
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid novel ID' }, { status: 400 });
    }

    // 获取请求体中的二进制数据
    const indexDump = await request.arrayBuffer();
    
    // 使用 UPSERT 语法，如果记录存在则更新，不存在则插入
    const query = `
      INSERT INTO novel_vector_indices (novel_id, index_dump)
      VALUES ($1, $2)
      ON CONFLICT (novel_id) 
      DO UPDATE SET index_dump = EXCLUDED.index_dump;
    `;

    await client.query(query, [id, Buffer.from(indexDump)]);

    return NextResponse.json({ message: 'Vector index updated successfully' });
  } catch (error) {
    console.error('Failed to update vector index:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    client.release();
  }
}