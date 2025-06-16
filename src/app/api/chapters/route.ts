import { query, getDbPool } from '@/lib/pg-db';
import { NextResponse } from 'next/server';

/**
 * GET /api/chapters?novel_id=[id]
 * 获取某本小说的所有章节
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const novelId = searchParams.get('novel_id');

    if (!novelId) {
      return NextResponse.json({ error: 'novel_id is required' }, { status: 400 });
    }
    const id = parseInt(novelId, 10);
    if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid novel_id' }, { status: 400 });
    }

    const result = await query('SELECT * FROM chapters WHERE novel_id = $1 ORDER BY chapter_number ASC', [id]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch chapters:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/chapters
 * 创建一个新章节
 */
export async function POST(request: Request) {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    const requestData = await request.json();
    let chapter = requestData.chapter;
    const { newCharacters, newPlotClues } = requestData;
    
    await client.query('BEGIN');

    // 检查章节是否已存在
    const existingChapter = await client.query(
      `SELECT id FROM chapters WHERE novel_id = $1 AND chapter_number = $2`,
      [chapter.novel_id, chapter.chapter_number]
    );

    let chapterId;
    if (existingChapter.rows.length > 0) {
      // 如果章节已存在，则更新它
      const updateResult = await client.query(
        `UPDATE chapters 
         SET title = $1, content = $2, summary = $3, is_published = $4, 
             word_count = $5, updated_at = $6
         WHERE novel_id = $7 AND chapter_number = $8
         RETURNING *`,
        [
          chapter.title,
          chapter.content,
          chapter.summary,
          chapter.is_published || false,
          chapter.word_count || 0,
          new Date(),
          chapter.novel_id,
          chapter.chapter_number
        ]
      );
      chapterId = updateResult.rows[0].id;
      chapter = updateResult.rows[0];
    } else {
      // 如果章节不存在，则插入新章节
      const insertResult = await client.query(
        `INSERT INTO chapters 
         (novel_id, chapter_number, title, content, summary, is_published, word_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         RETURNING *`,
        [
          chapter.novel_id,
          chapter.chapter_number,
          chapter.title,
          chapter.content,
          chapter.summary,
          chapter.is_published || false,
          chapter.word_count || 0,
          new Date()
        ]
      );
      chapterId = insertResult.rows[0].id;
      chapter = insertResult.rows[0];
    }

    const savedCharacters = [];
    // 插入新角色
    if (newCharacters && newCharacters.length > 0) {
      for (const character of newCharacters) {
        // 先检查角色是否已存在
        const existingChar = await client.query(
          `SELECT id FROM characters WHERE novel_id = $1 AND name = $2`,
          [character.novel_id, character.name]
        );

        if (existingChar.rows.length === 0) {
          const result = await client.query(
            `INSERT INTO characters 
             (novel_id, name, description, core_setting, personality, background_story,
              appearance, background, first_appeared_in_chapter, is_protagonist, status,
              relationships, avatar)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [
              character.novel_id,
              character.name,
              character.description || null,
              character.core_setting || null,
              character.personality || null,
              character.background_story || null,
              character.appearance || null,
              character.background || null,
              character.first_appeared_in_chapter || chapter.chapter_number,
              character.is_protagonist || false,
              character.status || 'active',
              character.relationships || null,
              character.avatar || null
            ]
          );
          savedCharacters.push(result.rows[0]);
        } else {
          savedCharacters.push(existingChar.rows[0]);
        }
      }
    }

    const savedPlotClues = [];
    // 插入新剧情线索
    if (newPlotClues && newPlotClues.length > 0) {
      for (const clue of newPlotClues) {
        // 先检查线索是否已存在
        const existingClue = await client.query(
          `SELECT id FROM plot_clues WHERE novel_id = $1 AND title = $2`,
          [clue.novel_id, clue.title]
        );

        if (existingClue.rows.length === 0) {
          const result = await client.query(
            `INSERT INTO plot_clues 
             (novel_id, title, description)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [
              clue.novel_id,
              clue.title,
              clue.description || null
            ]
          );
          savedPlotClues.push(result.rows[0]);
        } else {
          savedPlotClues.push(existingClue.rows[0]);
        }
      }
    }

    await client.query('COMMIT');

    return NextResponse.json({ 
      success: true, 
      message: existingChapter.rows.length > 0 ? '章节更新成功' : '章节保存成功',
      chapter,
      savedCharacters,
      savedPlotClues
    });

  } catch (error: unknown) {
    await client.query('ROLLBACK');
    console.error('保存章节时出错:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { error: 'Internal Server Error', details: errorMessage },
      { status: 500 }
    );
  } finally {
    client.release();
  }
} 