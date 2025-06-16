/**
 * 小说数据管理工具 (API-based)
 */
import type { Novel } from '@/types/novel';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import { loadVectorIndex } from './utils/rag-utils';
import { toast } from 'sonner';

/**
 * 获取所有小说列表
 * @param set - Zustand的set函数
 */
export const fetchNovels = async (
  set: (partial: any) => void
) => {
  set({ loading: true });
  try {
    const response = await fetch('/api/novels');
    if (!response.ok) {
      throw new Error('获取小说列表失败');
    }
    const novels = await response.json();
    set({ novels, loading: false });
  } catch (error) {
    console.error(error);
    toast.error('加载小说列表时出错。');
    set({ loading: false, novels: [] });
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
  try {
    // 获取小说基本信息
    const response = await fetch(`/api/novels/${id}`);
    if (!response.ok) {
      throw new Error('Failed to fetch novel details');
    }
    const novel = await response.json();

    // 获取章节列表
    const chaptersResponse = await fetch(`/api/chapters?novel_id=${id}`);
    if (!chaptersResponse.ok) {
      throw new Error('Failed to fetch chapters');
    }
    const chapters = await chaptersResponse.json();

    // 获取角色列表
    const charactersResponse = await fetch(`/api/characters?novel_id=${id}`);
    if (!charactersResponse.ok) {
      throw new Error('Failed to fetch characters');
    }
    const characters = await charactersResponse.json();

    // 如果提供了 get 和 set 函数，更新 store 状态
    if (get && set) {
      set({
        currentNovel: novel,
        chapters,
        characters,
      });

      // 尝试加载向量索引
      try {
        const vectorIndex = await loadVectorIndex(id);
        if (vectorIndex) {
          console.log(`[RAG] 成功加载小说 ${id} 的向量索引`);
          set({ currentNovelIndex: vectorIndex });
        } else {
          console.log(`[RAG] 小说 ${id} 没有向量索引，将在需要时创建`);
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
      const errorData = await response.json();
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
      const errorData = await response.json();
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