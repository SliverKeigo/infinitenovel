/**
 * 小说数据管理工具 (API-based)
 */
import type { Novel } from '@/types/novel';
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
 * 获取特定小说的详细信息
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 * @param id - 小说ID
 * @returns 小说详细信息，包括小说、章节和角色
 */
export const fetchNovelDetails = async (
  get: () => any,
  set: (partial: any) => void,
  id: number
) => {
  set({ detailsLoading: true });
  try {
    const response = await fetch(`/api/novels/${id}`);
    if (!response.ok) {
      throw new Error(`获取小说详情失败 (ID: ${id})`);
    }
    const { novel, chapters, characters, plotClues } = await response.json();

    set({
      currentNovel: novel,
      chapters,
      characters,
      plotClues,
      detailsLoading: false,
      currentNovelIndex: null, // 客户端向量索引已弃用
    });
    return { novel, chapters, characters };
  } catch (error) {
    console.error("获取小说详情失败:", error);
    toast.error("加载小说详情时出错。");
    set({ detailsLoading: false });
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