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

    // 检查小说是否存在
    const novelCheck = await client.query(
      'SELECT id FROM novels WHERE id = $1',
      [id]
    );

    if (novelCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    const result = await client.query(
      'SELECT index_dump FROM novel_vector_indices WHERE novel_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    // 返回序列化的数据
    const indexDump = result.rows[0].index_dump;
    // 将二进制数据转换为Base64字符串以便通过JSON传输
    const base64Data = indexDump.toString('base64');
    
    return NextResponse.json({ 
      data: base64Data
    });
  } catch (error) {
    console.error('[向量索引] 获取向量索引失败:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
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

    // 检查小说是否存在
    const novelCheck = await client.query(
      'SELECT id FROM novels WHERE id = $1',
      [id]
    );

    if (novelCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 });
    }

    // 获取请求体中的数据
    const body = await request.json();
    const indexDataString = body.data;
    
    // 验证数据格式
    if (typeof indexDataString !== 'string') {
      return NextResponse.json({ error: 'Invalid index data format, expected a string' }, { status: 400 });
    }

    // 在写入数据库前，必须将字符串转换为Buffer
    const indexDataBuffer = Buffer.from(indexDataString, 'utf-8');

    // 开始事务
    await client.query('BEGIN');

    try {
      // 使用 UPSERT 语法，如果记录存在则更新，不存在则插入
      const query = `
        INSERT INTO novel_vector_indices (novel_id, index_dump)
        VALUES ($1, $2)
        ON CONFLICT (novel_id) 
        DO UPDATE SET 
          index_dump = EXCLUDED.index_dump,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id;
      `;

      // 直接将原始字符串传递给数据库，驱动程序会处理编码
      const result = await client.query(query, [id, indexDataBuffer]);

      if (result.rows.length === 0) {
        throw new Error('向量索引保存失败');
      }

      // 提交事务
      await client.query('COMMIT');

      return NextResponse.json({ 
        message: 'Vector index updated successfully',
        id: result.rows[0].id
      });
    } catch (error) {
      // 回滚事务
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('[向量索引] 保存向量索引失败:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  } finally {
    client.release();
  }
}