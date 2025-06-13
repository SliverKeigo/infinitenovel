/**
 * 小说数据管理工具
 */
import { db } from '@/lib/db';
import { Voy } from 'voy-search';
import type { Novel } from '@/types/novel';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';

/**
 * 获取所有小说列表
 * @param set - Zustand的set函数
 */
export const fetchNovels = async (
  set: (partial: any) => void
) => {
  set({ loading: true });
  const novels = await db.novels.orderBy('updatedAt').reverse().toArray();
  set({ novels, loading: false });
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
  console.time('fetchNovelDetails Execution');
  set({ detailsLoading: true });
  try {
    console.time('数据库查询');
    const novel = await db.novels.get(id);
    if (!novel) throw new Error('Novel not found');

    const chapters = await db.chapters.where('novelId').equals(id).sortBy('chapterNumber');
    const characters = await db.characters.where('novelId').equals(id).toArray();
    const plotClues = await db.plotClues.where('novelId').equals(id).toArray();
    const savedIndexRecord = await db.novelVectorIndexes.get({ novelId: id });
    console.timeEnd('数据库查询');

    // 尝试加载已保存的向量索引
    let voyIndex: Voy | null = null;
    if (savedIndexRecord && savedIndexRecord.indexDump) {
      try {
        console.time('向量索引反序列化');
        voyIndex = Voy.deserialize(savedIndexRecord.indexDump);
        console.timeEnd('向量索引反序列化');
        console.log(`成功为小说ID ${id} 加载了已保存的向量索引。`);
      } catch (e) {
        console.error(`为小说ID ${id} 加载向量索引失败:`, e);
      }
    }

    set({
      currentNovel: novel,
      chapters,
      characters,
      plotClues,
      detailsLoading: false,
      currentNovelIndex: voyIndex, // 设置加载到的索引或null
    });
    return { novel, chapters, characters };
  } catch (error) {
    console.error("Failed to fetch novel details:", error);
    set({ detailsLoading: false });
    return null;
  } finally {
    console.timeEnd('fetchNovelDetails Execution');
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
  novelData: Omit<Novel, 'id' | 'createdAt' | 'updatedAt' | 'wordCount' | 'chapterCount' | 'characterCount' | 'expansionCount' | 'plotOutline' | 'plotClueCount'>
) => {
  // novelData 的类型是 Omit<Novel, ...>，只包含Novel本身的属性
  const newNovel: Omit<Novel, 'id'> = {
    ...novelData,
    wordCount: 0,
    chapterCount: 0,
    characterCount: 0,
    expansionCount: 0,
    plotOutline: '',
    plotClueCount: 0,
    description: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    specialRequirements: novelData.specialRequirements || '',
  };
  const newId = await db.novels.add(newNovel as Novel);
  await get().fetchNovels();
  return newId;
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
  await db.novels.delete(id);
  await db.chapters.where('novelId').equals(id).delete();
  await db.characters.where('novelId').equals(id).delete();
  await db.plotClues.where('novelId').equals(id).delete();
  await db.novelVectorIndexes.where('novelId').equals(id).delete();
  set((state: any) => ({
    novels: state.novels.filter((novel: Novel) => novel.id !== id),
  }));
}; 