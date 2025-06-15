import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';
import { defaultSettings } from '@/store/generation-settings';

const SETTINGS_ID = 1;

/**
 * GET /api/generation-settings
 * Fetches the global generation settings.
 */
export async function GET() {
  try {
    let result = await query('SELECT * FROM generation_settings WHERE id = $1', [SETTINGS_ID]);

    if (result.rows.length === 0) {
      // If no settings exist, insert the default ones
      const { max_tokens, segments_per_chapter, temperature, top_p, frequency_penalty, presence_penalty, character_creativity } = defaultSettings;
      const insertQuery = `
        INSERT INTO generation_settings (id, max_tokens, segments_per_chapter, temperature, top_p, frequency_penalty, presence_penalty, character_creativity)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
      `;
      result = await query(insertQuery, [SETTINGS_ID, max_tokens, segments_per_chapter, temperature, top_p, frequency_penalty, presence_penalty, character_creativity]);
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to fetch generation settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PUT /api/generation-settings
 * Updates the global generation settings.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    
    // Dynamically build the update query
    const fields: string[] = [];
    const values: any[] = [];
    let fieldIndex = 1;

    for (const [key, value] of Object.entries(body)) {
      fields.push(`${key} = $${fieldIndex++}`);
      values.push(value);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(SETTINGS_ID);
    
    const updateQuery = `
      UPDATE generation_settings
      SET ${fields.join(', ')}
      WHERE id = $${fieldIndex}
      RETURNING *;
    `;

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update generation settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 