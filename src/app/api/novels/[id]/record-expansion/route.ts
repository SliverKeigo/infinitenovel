import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * POST /api/novels/[id]/record-expansion
 * Increments the expansion count for a novel.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const novelId = parseInt(params.id, 10);
    if (isNaN(novelId)) {
      return NextResponse.json({ error: 'Invalid novel ID' }, { status: 400 });
    }

    const updateQuery = `
      UPDATE novels
      SET 
        expansion_count = expansion_count + 1,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const result = await query(updateQuery, [novelId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Novel not found or failed to update' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`Failed to record expansion for novel ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 