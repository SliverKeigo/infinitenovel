import { create } from 'zustand';
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
import type { GenerationTask } from '@/types/novel';

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
import { 
  buildNovelIndex as buildNovelIndexUtil,
  deleteVectorIndex as deleteNovelIndexUtil 
} from './novel/index-utils';
import { planNextAct } from './novel/generators/act-planner';
import { extractNarrativeStages, extractDetailedAndMacro } from './novel/parsers';

const ACT_PLANNING_THRESHOLD = 10; // 当剩余规划章节少于10章时，开始规划下一幕

interface DocumentToIndex {
  id: string;
  title: string;
  text: string;
}

export interface NovelState {
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
  fetchNovels: (page?: number, pageSize?: number) => Promise<void>;
  fetchNovelDetails: (id: number) => Promise<{ novel: Novel; chapters: Chapter[]; characters: Character[] } | null>;
  buildNovelIndex: (id: number, onSuccess?: () => void) => Promise<void>;
  deleteNovelIndex: (id: number) => Promise<void>;
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
  generateNovelChapters: (novelId: number, goal: number, initialChapterGoal?: number) => Promise<{ plotOutline: string; } | { plotOutline: null; }>;
  saveGeneratedChapter: (novelId: number) => Promise<void>;
  addNovel: (novel: Omit<Novel, 'id' | 'createdAt' | 'updatedAt' | 'wordCount' | 'chapterCount' | 'characterCount' | 'expansionCount' | 'plotOutline' | 'plotClueCount'>) => Promise<number | undefined>;
  deleteNovel: (id: number) => Promise<void>;
  updateNovelStats: (novelId: number) => Promise<void>;
  recordExpansion: (novelId: number) => Promise<void>;
  expandPlotOutlineIfNeeded: (novelId: number, force?: boolean) => Promise<void>;
  forceExpandOutline: (novelId: number) => Promise<void>;
  resetGenerationTask: () => void;
  checkForNextActPlanning: (novelId: number) => Promise<void>;
  publishChapter: (chapterId: number) => Promise<void>;
  totalNovels: number;
  currentPage: number;
  pageSize: number;
}

export const useNovelStore = create<NovelState>((set, get) => ({
  novels: [],
  currentNovel: null,
  chapters: [],
  characters: [],
  plotClues: [],
  loading: false,
  detailsLoading: false,
  currentNovelIndex: null,
  currentNovelDocuments: [],
  indexLoading: false,
  totalNovels: 0,
  currentPage: 1,
  pageSize: 10,
  generationLoading: false,
  isPlanningAct: false,
  generatedContent: null,
  generationTask: {
    isActive: false,
    progress: 0,
    currentStep: '空闲',
    novelId: null,
    mode: 'idle'
  },

  // 获取小说列表
  fetchNovels: async (page?: number, pageSize?: number) => {
    await fetchNovelsData(set, page, pageSize);
  },

  fetchNovelDetails: async (id) => {
    return fetchNovelDetailsData(id, get, set);
  },

  buildNovelIndex: async (id, onSuccess) => {
    return buildNovelIndexUtil(get, set, id, onSuccess);
  },

  deleteNovelIndex: async (id) => {
    return deleteNovelIndexUtil(get, set, id);
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
    const { currentNovel } = get();
    if (!currentNovel) {
      toast.error("没有选中任何小说，无法生成章节。");
      return;
    }
    return genNewChapter(get, set, currentNovel, context, userPrompt, chapterToGenerate);
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
      set({ isPlanningAct: true });
      
      const response = await fetch(`/api/novels/${novelId}/plan-next-act`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('API call failed');
      }

      const result = await response.json() as { success: boolean, message: string };
      
      if (result.success) {
        toast.info(`AI已为您规划好下一幕：${result.message}`);
        // 刷新小说数据以获取更新后的大纲
        await get().fetchNovelDetails(novelId);
      } else {
        // 后端跳过了规划，打印消息但不是错误
        console.log(`[Watcher] ${result.message}`);
      }
    } catch (error) {
      console.error("[Watcher] 规划下一幕时发生错误:", error);
      toast.error(`规划下一幕时发生错误: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      set({ isPlanningAct: false });
    }
  },

  publishChapter: async (chapterId: number) => {
    try {
      // 先获取章节信息
      const chapter = get().chapters.find((c) => c.id === chapterId);
      if (!chapter) {
        throw new Error('章节不存在');
      }
      
      if (chapter.is_published) {
        throw new Error('该章节已经发布');
      }

      const response = await fetch(`/api/chapters/${chapterId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: true }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`发布失败: ${error}`);
      }

      const updatedChapter = await response.json() as Chapter;

      set((state) => ({
        chapters: state.chapters.map((chapter) =>
          chapter.id === chapterId ? { ...chapter, is_published: true } : chapter
        ),
      }));
    } catch (error) {
      console.error("发布章节失败:", error);
      throw error; // 将错误抛出，让调用者处理
    }
  },

  resetGenerationTask: () => {
    resetTask(get, set);
  },
}));