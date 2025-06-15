import { create } from 'zustand';
import { db } from '@/lib/db';
import type { Novel } from '@/types/novel';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';
import { Voy } from 'voy-search';
import { EmbeddingPipeline } from '@/lib/embeddings';
import { useAIConfigStore } from '@/store/ai-config';
import { useGenerationSettingsStore } from '@/store/generation-settings';
import OpenAI from 'openai';
import { toast } from "sonner";
import type { GenerationSettings } from '@/types/generation-settings';
import { APIError } from 'openai/error';

// 导入拆分出去的常量和工具函数
import {
  countDetailedChaptersInOutline,
  getChapterOutline,
  getChapterOutlineByIndex,
  extractChapterNumbers
} from './novel/outline-utils';
import { parseJsonFromAiResponse } from './novel/parsers';
import { handleOpenAIError } from './novel/error-handlers';
import { getGenreStyleGuide } from './novel/style-guides';
import { 
  generateNewChapter as genNewChapter, 
  ChapterGenerationContext 
} from './novel/generators/chapter-generator';
import { 
  expandPlotOutlineIfNeeded as expandOutline,
  forceExpandOutline as forceExpand
} from './novel/generators/outline-generator';
import { 
  generateNovelChapters as genNovelChapters 
} from './novel/generators/novel-generator';
import { 
  generateChapters as genChapters 
} from './novel/generators/chapter-controller';
import { saveGeneratedChapter as saveChapter } from './novel/chapter-utils';
import { updateNovelStats, recordExpansion } from './novel/stats-utils';
import { resetGenerationTask as resetTask } from './novel/task-utils';
import { 
  fetchNovels as fetchNovelsData,
  fetchNovelDetails as fetchNovelDetailsData,
  addNovel as addNovelData,
  deleteNovel as deleteNovelData
} from './novel/data-utils';
import { buildNovelIndex as buildIndex } from './novel/index-utils';
import { planNextAct } from './novel/generators/act-planner';
import { extractNarrativeStages, extractDetailedAndMacro } from './novel/parsers';

const ACT_PLANNING_THRESHOLD = 10; // 当剩余规划章节少于10章时，开始规划下一幕

interface DocumentToIndex {
  id: string;
  title: string;
  text: string;
}

interface GenerationTask {
  isActive: boolean;
  progress: number;
  currentStep: string;
  novelId: number | null;
  mode: 'create' | 'continue' | 'idle'; // 添加mode字段，用于区分创建新小说和续写现有小说
}

interface NovelState {
  novels: Novel[];
  loading: boolean;
  currentNovel: Novel | null;
  currentNovelIndex: Voy | null;
  currentNovelDocuments: DocumentToIndex[];
  chapters: Chapter[];
  characters: Character[];
  plotClues: PlotClue[];
  detailsLoading: boolean;
  indexLoading: boolean;
  generationLoading: boolean;
  isPlanningAct: boolean; // 新增：用于追踪幕间规划状态
  generatedContent: string | null;
  generationTask: GenerationTask;
  fetchNovels: () => Promise<void>;
  fetchNovelDetails: (id: number) => Promise<{ novel: Novel; chapters: Chapter[]; characters: Character[] } | null>;
  buildNovelIndex: (id: number, onSuccess?: () => void) => Promise<void>;
  generateChapters: (
    novelId: number,
    context: {
      plotOutline: string;
      characters: Character[];
      settings: GenerationSettings;
    },
    options: {
      chaptersToGenerate: number;
      userPrompt?: string;
    }
  ) => Promise<void>;
  generateNewChapter: (
    novelId: number,
    context: {
      plotOutline: string;
      characters: Character[];
      settings: GenerationSettings;
    },
    userPrompt: string | undefined,
    chapterToGenerate: number,
  ) => Promise<void>;
  generateNovelChapters: (novelId: number, goal: number, initialChapterGoal?: number) => Promise<void>;
  saveGeneratedChapter: (novelId: number) => Promise<void>;
  addNovel: (novel: Omit<Novel, 'id' | 'createdAt' | 'updatedAt' | 'wordCount' | 'chapterCount' | 'characterCount' | 'expansionCount' | 'plotOutline' | 'plotClueCount'>) => Promise<number | undefined>;
  deleteNovel: (id: number) => Promise<void>;
  updateNovelStats: (novelId: number) => Promise<void>;
  recordExpansion: (novelId: number) => Promise<void>;
  expandPlotOutlineIfNeeded: (novelId: number, force?: boolean) => Promise<void>;
  forceExpandOutline: (novelId: number) => Promise<void>;
  resetGenerationTask: () => void;
  publishChapter: (chapterId: number) => Promise<void>;
  checkForNextActPlanning: (novelId: number) => Promise<void>;
}

export const useNovelStore = create<NovelState>((set, get) => ({
  novels: [],
  loading: true,
  currentNovel: null,
  currentNovelIndex: null,
  currentNovelDocuments: [],
  chapters: [],
  characters: [],
  plotClues: [],
  detailsLoading: true,
  indexLoading: false,
  generationLoading: false,
  isPlanningAct: false, // 新增：初始化状态
  generatedContent: null,
  generationTask: {
    isActive: false,
    progress: 0,
    currentStep: '空闲',
    novelId: null,
    mode: 'idle',
  },
  resetGenerationTask: () => {
    resetTask(get, set);
  },
  fetchNovels: async () => {
    return fetchNovelsData(set);
  },
  fetchNovelDetails: async (id) => {
    return fetchNovelDetailsData(get, set, id);
  },
  buildNovelIndex: async (id, onSuccess) => {
    return buildIndex(get, set, id, onSuccess);
  },
  generateChapters: async (novelId, context, options) => {
    return genChapters(get, set, novelId, context, options);
  },
  generateNovelChapters: async (novelId, goal, initialChapterGoal = 5) => {
    return genNovelChapters(get, set, novelId, goal, initialChapterGoal);
  },
  generateNewChapter: async (
    novelId: number,
    context: {
      plotOutline: string;
      characters: Character[];
      settings: GenerationSettings;
    },
    userPrompt: string | undefined,
    chapterToGenerate: number,
  ) => {
    return genNewChapter(get, set, novelId, context, userPrompt, chapterToGenerate);
  },
  saveGeneratedChapter: async (novelId) => {
    return saveChapter(get, set, novelId);
  },
  addNovel: async (novelData) => {
    return addNovelData(get, novelData);
  },
  deleteNovel: async (id) => {
    return deleteNovelData(set, id);
  },
  updateNovelStats: async (novelId: number) => {
    return updateNovelStats(get, novelId);
  },
  recordExpansion: async (novelId: number) => {
    return recordExpansion(get, novelId);
  },
  expandPlotOutlineIfNeeded: async (novelId: number, force = false) => {
    return expandOutline(get, novelId, force);
  },
  forceExpandOutline: async (novelId: number) => {
    return forceExpand(get, set, novelId);
  },
  checkForNextActPlanning: async (novelId: number) => {
    const { isPlanningAct } = get();
    if (isPlanningAct) {
      console.log("[Watcher] 幕间规划已在进行中，跳过本次检查。");
      return;
    }

    try {
      const novel = await db.novels.get(novelId);
      if (!novel || !novel.plotOutline) return;

      const nextChapterNumber = (await db.chapters.where('novelId').equals(novelId).count()) + 1;
      
      const { detailed } = extractDetailedAndMacro(novel.plotOutline);
      const plannedChapters = extractChapterNumbers(detailed);
      if (plannedChapters.length === 0) return;
      
      const lastPlannedChapter = Math.max(...plannedChapters);

      if (lastPlannedChapter - nextChapterNumber > ACT_PLANNING_THRESHOLD) {
        // 距离足够远，无需规划
        return;
      }

      const allStages = extractNarrativeStages(novel.plotOutline);
      if (allStages.length <= 1) return; // 只有一个幕或者没有幕，无需规划

      // 寻找下一个需要规划的幕
      const lastPlannedStage = allStages.find(stage => stage.chapterRange.end === lastPlannedChapter);
      if (!lastPlannedStage) return;

      const nextStageIndex = allStages.findIndex(stage => stage.stageName === lastPlannedStage.stageName) + 1;
      if (nextStageIndex >= allStages.length) return; // 已经是最后一幕了

      const nextStageToPlan = allStages[nextStageIndex];
      
      // 检查下一幕是否已经规划过了
      if(plannedChapters.includes(nextStageToPlan.chapterRange.start)) {
        console.log(`[Watcher] 检测到下一幕 "${nextStageToPlan.stageName}" 已被规划，跳过。`);
        return;
      }
      
      set({ isPlanningAct: true });
      toast.info(`您已接近当前幕布的尾声，AI正在为您规划下一幕：${nextStageToPlan.stageName}`);

      const newPlotOutline = await planNextAct(novelId, nextStageToPlan, novel.plotOutline);
      
      await db.novels.update(novelId, { plotOutline: newPlotOutline });
      
      toast.success(`下一幕 "${nextStageToPlan.stageName}" 已规划完毕！`);

    } catch (error) {
      console.error("[Watcher] 规划下一幕时发生错误:", error);
      toast.error(`规划下一幕时发生错误: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      set({ isPlanningAct: false });
    }
  },
  publishChapter: async (chapterId: number) => {
    try {
      await db.chapters.update(chapterId, { status: 'published' });
      set((state) => ({
        chapters: state.chapters.map((chapter) =>
          chapter.id === chapterId ? { ...chapter, status: 'published' } : chapter
        ),
      }));
      toast.success("章节已成功发布！");
    } catch (error) {
      console.error("发布章节失败:", error);
      toast.error("发布章节失败，请查看控制台获取更多信息。");
    }
  },
}));