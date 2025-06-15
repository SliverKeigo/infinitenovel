import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * POST /api/novels/[id]/stats
 * Recalculates and updates the statistics for a novel.
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
      WITH stats AS (
        SELECT
          (SELECT COUNT(*) FROM chapters WHERE novel_id = $1) AS chapter_count,
          (SELECT COUNT(*) FROM characters WHERE novel_id = $1) AS character_count,
          (SELECT COUNT(*) FROM plot_clues WHERE novel_id = $1) AS plot_clue_count,
          (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE novel_id = $1) AS word_count
      )
      UPDATE novels
      SET
        chapter_count = stats.chapter_count,
        character_count = stats.character_count,
        plot_clue_count = stats.plot_clue_count,
        word_count = stats.word_count,
        updated_at = NOW()
      FROM stats
      WHERE id = $1
      RETURNING *;
    `;

    const result = await query(updateQuery, [novelId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Novel not found or failed to update' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(`Failed to update stats for novel ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 