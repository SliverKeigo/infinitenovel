/**
 * 小说统计信息管理工具
 */
import { db } from '@/lib/db';

/**
 * 更新小说统计信息
 * @param get - Zustand的get函数
 * @param novelId - 小说ID
 */
export const updateNovelStats = async (
  get: () => any,
  novelId: number
) => {
  const novel = await db.novels.get(novelId);
  if (!novel) return;

  const chapters = await db.chapters.where('novelId').equals(novelId).toArray();
  const characters = await db.characters.where('novelId').equals(novelId).toArray();
  const plotClues = await db.plotClues.where('novelId').equals(novelId).toArray();

  const totalWordCount = chapters.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0);

  await db.novels.update(novelId, {
    chapterCount: chapters.length,
    characterCount: characters.length,
    plotClueCount: plotClues.length,
    wordCount: totalWordCount,
    updatedAt: new Date(),
  });

  // After updating the source of truth, refresh the state
  await get().fetchNovelDetails(novelId);
};

/**
 * 记录小说扩展次数
 * @param get - Zustand的get函数
 * @param novelId - 小说ID
 */
export const recordExpansion = async (
  get: () => any,
  novelId: number
) => {
  const novel = await db.novels.get(novelId);
  if (novel) {
    await db.novels.update(novelId, {
      expansionCount: novel.expansionCount + 1,
      updatedAt: new Date(),
    });
    await get().fetchNovelDetails(novelId);
  }
}; 