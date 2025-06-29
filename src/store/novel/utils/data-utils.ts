/**
 * 小说数据管理工具 (API-based)
 */
import type { Novel } from '@/types/novel';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';
import { loadVectorIndex } from './rag-utils';
import { toast } from 'sonner';

/**
 * 获取小说列表
 * @param set - Zustand的set函数
 * @param page - 当前页码（从1开始）
 * @param pageSize - 每页数量
 */
export const fetchNovels = async (
  set: (partial: any) => void,
  page: number = 1,
  pageSize: number = 10
) => {
  set({ loading: true });
  try {
    const offset = (page - 1) * pageSize;
    const response = await fetch(`/api/novels?limit=${pageSize}&offset=${offset}`);
    if (!response.ok) {
      throw new Error('获取小说列表失败');
    }
    const data = await response.json() as { novels: Novel[], total: number };
    set({ 
      novels: data.novels, 
      totalNovels: data.total,
      currentPage: page,
      pageSize,
      loading: false 
    });
  } catch (error) {
    console.error(error);
    toast.error('加载小说列表时出错。');
    set({ 
      loading: false, 
      novels: [],
      totalNovels: 0,
      currentPage: 1,
      pageSize: 10
    });
  }
};

/**
 * 获取小说详细信息
 * @param id - 小说ID
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 */
export const fetchNovelDetails = async (
  id: number,
  get?: () => any,
  set?: (partial: any) => void
) => {
  if (set) set({ detailsLoading: true });
  try {
    // 获取小说基本信息
    const response = await fetch(`/api/novels/${id}`);
    if (!response.ok) {
      throw new Error('Failed to fetch novel details');
    }
    const novel = await response.json() as Novel;

    // 获取章节列表
    const chaptersResponse = await fetch(`/api/chapters?novel_id=${id}`);
    if (!chaptersResponse.ok) {
      throw new Error('Failed to fetch chapters');
    }
    const chapters = await chaptersResponse.json() as Chapter[];

    // 获取角色列表
    const charactersResponse = await fetch(`/api/characters?novel_id=${id}`);
    if (!charactersResponse.ok) {
      throw new Error('Failed to fetch characters');
    }
    const characters = await charactersResponse.json() as Character[];

    // 获取情节线索列表
    const plotCluesResponse = await fetch(`/api/plot-clues?novel_id=${id}`);
    if (!plotCluesResponse.ok) {
      throw new Error('Failed to fetch plot clues');
    }
    const plotClues = await plotCluesResponse.json() as PlotClue[];

    // 如果提供了 get 和 set 函数，更新 store 状态
    if (get && set) {
      const safeCreateDate = (dateStr: string | Date | null | undefined): Date => {
        if (dateStr && new Date(dateStr).toString() !== 'Invalid Date') {
          return new Date(dateStr);
        }
        return new Date(0); 
      };

      // 在存入 store 之前，转换日期字符串为 Date 对象
      const hydratedNovel = {
        ...novel,
        created_at: safeCreateDate(novel.created_at),
        updated_at: safeCreateDate(novel.updated_at),
      };
      
      const hydratedChapters = chapters.map((chapter: any) => ({
        ...chapter,
        created_at: safeCreateDate(chapter.created_at),
        updated_at: safeCreateDate(chapter.updated_at),
      }));

      const hydratedPlotClues = plotClues.map((clue: any) => ({
        ...clue,
        created_at: safeCreateDate(clue.created_at),
        updated_at: safeCreateDate(clue.updated_at),
      }));

      set({
        currentNovel: hydratedNovel,
        chapters: hydratedChapters,
        characters,
        plotClues: hydratedPlotClues,
      });

      // 尝试加载向量索引
      try {
        const vectorIndex = await loadVectorIndex(id);
        if (vectorIndex) {
          set({ currentNovelIndex: vectorIndex });
        } else { 
          set({ currentNovelIndex: null });
        }
      } catch (error) {
        console.error(`[RAG] 加载向量索引失败:`, error);
        toast.error("加载向量索引失败，将在需要时重新创建");
        set({ currentNovelIndex: null });
      }
    }

    return { novel, chapters, characters };
  } catch (error) {
    console.error('Failed to fetch novel details:', error);
    if (get && set) {
      set({
        currentNovel: null,
        chapters: [],
        characters: [],
        currentNovelIndex: null
      });
    }
    return null;
  } finally {
    if (set) set({ detailsLoading: false });
  }
};

/**
 * 添加新小说
 * @param get - Zustand的get函数
 * @param novelData - 小说数据
 * @returns 新小说的ID
 */
export const addNovel = async (
  get: () => any,
  novelData: Omit<Novel, 'id' | 'createdAt' | 'updatedAt' | 'wordCount' | 'chapterCount' | 'characterCount' | 'expansionCount' | 'plotOutline' | 'plotClueCount' | 'description' | 'specialRequirements'> & { description?: string; specialRequirements?: string; }
) => {
  try {
    const response = await fetch('/api/novels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(novelData)
    });

    if (!response.ok) {
      const errorData = await response.json() as { message: string };
      throw new Error(errorData.message || '创建新小说失败');
    }

    const newNovel = await response.json();
    toast.success(`小说《${newNovel.name}》已创建！`);

    await get().fetchNovels(); // 刷新列表
    return newNovel.id;
  } catch (error: any) {
    console.error("添加小说失败:", error);
    toast.error(`添加小说失败: ${error.message}`);
    return null;
  }
};

/**
 * 删除小说及其相关数据
 * @param set - Zustand的set函数
 * @param id - 小说ID
 */
export const deleteNovel = async (
  set: (partial: any) => void,
  id: number
) => {
  try {
    const response = await fetch(`/api/novels/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json() as { message: string };
      throw new Error(errorData.message || '删除小说失败');
    }

    toast.success('小说已成功删除。');
    set((state: any) => ({
      novels: state.novels.filter((novel: Novel) => novel.id !== id),
    }));
  } catch (error: any) {
    console.error("删除小说失败:", error);
    toast.error(`删除小说失败: ${error.message}`);
  }
}; 