/**
 * 小说向量索引管理工具
 */
import { db } from '@/lib/db';
import { Voy } from 'voy-search';
import { EmbeddingPipeline } from '@/lib/embeddings';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';

/**
 * 构建小说向量索引
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 * @param id - 小说ID
 * @param onSuccess - 成功后的回调函数
 */
export const buildNovelIndex = async (
  get: () => any,
  set: (partial: any) => void,
  id: number,
  onSuccess?: () => void
) => {
  set({ indexLoading: true, currentNovelIndex: null });
  try {
    const fetchedData = await get().fetchNovelDetails(id);

    if (!fetchedData) {
      throw new Error('Failed to fetch novel data for indexing.');
    }

    const { chapters, characters } = fetchedData;
    const plotClues = await db.plotClues.where('novelId').equals(id).toArray();

    interface DocumentToIndex {
      id: string;
      title: string;
      text: string;
    }

    const documentsToIndex: DocumentToIndex[] = [];

    chapters.forEach((c: Chapter) => documentsToIndex.push({
      id: `chapter-${c.id}`,
      title: `第${c.chapterNumber}章`,
      text: c.summary || c.content.substring(0, 500)
    }));

    characters.forEach((c: Character) => documentsToIndex.push({
      id: `character-${c.id}`,
      title: c.name,
      text: `姓名: ${c.name}, 核心设定: ${c.coreSetting}, 性格: ${c.personality}, 背景: ${c.backgroundStory}`
    }));

    plotClues.forEach((p: PlotClue) => documentsToIndex.push({
      id: `plot-${p.id}`,
      title: p.title,
      text: p.description
    }));

    set({ currentNovelDocuments: documentsToIndex });

    if (documentsToIndex.length === 0) {
      set({ currentNovelIndex: new Voy(), indexLoading: false });
      console.warn("Building an empty index as there are no chapters or characters.");
      onSuccess?.();
      return;
    }

    const embeddings = await EmbeddingPipeline.embed(documentsToIndex.map(d => d.text));

    const dataForVoy = documentsToIndex.map((doc, i) => ({
      id: doc.id,
      title: doc.title,
      url: `#${doc.id}`,
      embeddings: embeddings[i],
    }));

    const newIndex = new Voy({ embeddings: dataForVoy });

    set({ currentNovelIndex: newIndex, indexLoading: false });

    // 将新创建的索引持久化到数据库
    try {
      const serializedIndex = newIndex.serialize();
      // 使用 put 并指定 novelId 作为查找键，实现覆盖更新
      await db.novelVectorIndexes.put({
        novelId: id,
        indexDump: serializedIndex,
      });
      console.log(`成功为小说ID ${id} 保存了向量索引。`);
    } catch (e) {
      console.error(`为小说ID ${id} 保存向量索引失败:`, e);
    }

    onSuccess?.();

  } catch (error: any) {
    console.error("Failed to build novel index:", error);
    set({ indexLoading: false });
  }
}; 