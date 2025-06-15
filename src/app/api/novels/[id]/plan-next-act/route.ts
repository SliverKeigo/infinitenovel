import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';
import { planNextAct } from '@/store/novel/generators/act-planner';
import { extractNarrativeStages, extractDetailedAndMacro } from '@/store/novel/parsers';
import { extractChapterNumbers } from '@/store/novel/outline-utils';

const ACT_PLANNING_THRESHOLD = 10;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const novelId = parseInt(params.id, 10);
  if (isNaN(novelId)) {
    return NextResponse.json({ error: 'Invalid novel ID' }, { status: 400 });
  }

  try {
    const novelResult = await query('SELECT * FROM novels WHERE id = $1', [novelId]);
    const novel = novelResult.rows[0];

    if (!novel || !novel.plot_outline) {
      return NextResponse.json({ message: 'Novel or plot outline not found, skipping planning.' }, { status: 200 });
    }

    const chaptersResult = await query('SELECT chapter_number FROM chapters WHERE novel_id = $1', [novelId]);
    const nextChapterNumber = chaptersResult.rows.length + 1;

    const { detailed } = extractDetailedAndMacro(novel.plot_outline);
    const plannedChapters = extractChapterNumbers(detailed);
    if (plannedChapters.length === 0) {
      return NextResponse.json({ message: 'No planned chapters found, skipping planning.' }, { status: 200 });
    }

    const lastPlannedChapter = Math.max(...plannedChapters);

    if (lastPlannedChapter - nextChapterNumber > ACT_PLANNING_THRESHOLD) {
      return NextResponse.json({ message: 'Sufficient chapters planned, skipping.' }, { status: 200 });
    }

    const allStages = extractNarrativeStages(novel.plot_outline);
    if (allStages.length <= 1) {
      return NextResponse.json({ message: 'Not enough narrative stages to plan, skipping.' }, { status: 200 });
    }
    
    const lastPlannedStage = allStages.find(stage => stage.chapterRange.end === lastPlannedChapter);
    if (!lastPlannedStage) return NextResponse.json({ message: 'Could not determine the last planned stage.' }, { status: 200 });

    const nextStageIndex = allStages.findIndex(stage => stage.stageName === lastPlannedStage.stageName) + 1;
    if (nextStageIndex >= allStages.length) {
      return NextResponse.json({ message: 'Already at the last stage.' }, { status: 200 });
    }

    const nextStageToPlan = allStages[nextStageIndex];

    if (plannedChapters.includes(nextStageToPlan.chapterRange.start)) {
        return NextResponse.json({ message: `Next act "${nextStageToPlan.stageName}" is already planned, skipping.` }, { status: 200 });
    }

    console.log(`[API] Planning next act for novel ${novelId}: "${nextStageToPlan.stageName}"`);
    const newPlotOutline = await planNextAct(novelId, nextStageToPlan, novel.plot_outline);

    await query('UPDATE novels SET plot_outline = $1, updated_at = NOW() WHERE id = $2', [newPlotOutline, novelId]);
    
    console.log(`[API] Successfully planned and updated outline for novel ${novelId}.`);
    return NextResponse.json({ success: true, message: `Successfully planned act: ${nextStageToPlan.stageName}` });

  } catch (error) {
    console.error(`[API] Error planning next act for novel ${novelId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 