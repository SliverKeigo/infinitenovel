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
}));