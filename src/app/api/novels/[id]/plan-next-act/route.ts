import { query } from '@/lib/pg-db';
import { NextResponse } from 'next/server';
import { planNextAct } from '@/store/novel/generators/act-planner';
import { extractNarrativeStages, extractDetailedAndMacro } from '@/store/novel/parsers';
import { extractChapterNumbers, getOutlineForChapterRange } from '@/store/novel/utils/outline-utils';
import type { AIConfig } from '@/types/ai-config';

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
    // 从数据库获取激活的AI配置
    const activeConfigResult = await query("SELECT * FROM ai_configs WHERE status = 'active' LIMIT 1");
    if (activeConfigResult.rows.length === 0) {
      return NextResponse.json({ error: 'No active AI configuration found in the database.' }, { status: 500 });
    }
    const activeConfig = activeConfigResult.rows[0];

    const novelResult = await query('SELECT * FROM novels WHERE id = $1', [novelId]);
    const novel = novelResult.rows[0];

    if (!novel || !novel.plot_outline) {
      return NextResponse.json({ message: 'Novel or plot outline not found, skipping planning.' }, { status: 200 });
    }

    const { detailed: detailedOutline } = extractDetailedAndMacro(novel.plot_outline);
    if (!detailedOutline) {
      return NextResponse.json({ message: 'Detailed outline not found, skipping planning.' }, { status: 200 });
    }

    const chaptersResult = await query('SELECT chapter_number FROM chapters WHERE novel_id = $1', [novelId]);
    const nextChapterNumber = chaptersResult.rows.length + 1;

    const plannedChapters = extractChapterNumbers(detailedOutline);
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

    const lastAct = allStages[allStages.length - 1];
    let previousActOutline: string | undefined;

    if (lastAct) {
      const previousActStartChapter = lastAct.chapterRange.start;
      const previousActEndChapter = lastAct.chapterRange.end;

      // [优化] 只取上一幕最后10章作为上下文，避免Prompt过长
      const contextStartChapter = Math.max(
        previousActStartChapter,
        previousActEndChapter - 9
      );

      previousActOutline = getOutlineForChapterRange(
        novel.plot_outline || '',
        { start: contextStartChapter, end: previousActEndChapter }
      );
    }

    const nextStageIndex = allStages.findIndex(stage => stage.stageName === lastPlannedStage.stageName) + 1;
    if (nextStageIndex >= allStages.length) {
      return NextResponse.json({ message: 'Already at the last stage.' }, { status: 200 });
    }

    const nextStageToPlan = allStages[nextStageIndex];

    if (plannedChapters.includes(nextStageToPlan.chapterRange.start)) {
        return NextResponse.json({ message: `Next act "${nextStageToPlan.stageName}" is already planned, skipping.` }, { status: 200 });
    }

    const newPlotOutline = await planNextAct(novel, activeConfig, nextStageToPlan, previousActOutline || null);

    await query('UPDATE novels SET plot_outline = $1, updated_at = NOW() WHERE id = $2', [newPlotOutline, novelId]);
    
    return NextResponse.json({ success: true, message: `Successfully planned act: ${nextStageToPlan.stageName}` });

  } catch (error) {
    console.error(`[API] Error planning next act for novel ${novelId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 