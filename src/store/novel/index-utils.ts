/**
 * 小说向量索引管理工具
 */
import { Voy } from 'voy-search';
import { EmbeddingPipeline } from '@/lib/embeddings';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';
import { saveVectorIndex } from './utils/rag-utils';

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
    
    const plotCluesResponse = await fetch(`/api/plot-clues?novel_id=${id}`);
    if (!plotCluesResponse.ok) throw new Error('Failed to fetch plot clues');
    const plotClues = await plotCluesResponse.json();

    interface DocumentToIndex {
      id: string;
      title: string;
      text: string;
    }

    const documentsToIndex: DocumentToIndex[] = [];

    chapters.forEach((c: Chapter) => documentsToIndex.push({
      id: `chapter-${c.id}`,
      title: `第${c.chapter_number}章`,
      text: c.summary || c.content.substring(0, 500)
    }));

    characters.forEach((c: Character) => documentsToIndex.push({
      id: `character-${c.id}`,
      title: c.name,
      text: `姓名: ${c.name}, 核心设定: ${c.core_setting}, 性格: ${c.personality}, 背景: ${c.background_story}`
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
      await saveVectorIndex(id, newIndex);
      console.log(`[RAG] 成功为小说ID ${id} 保存了向量索引。`);
    } catch (e) {
      console.error(`[RAG] 为小说ID ${id} 保存向量索引失败:`, e);
    }

    onSuccess?.();

  } catch (error) {
    console.error('Failed to build novel index:', error);
    set({ indexLoading: false });
  }
}; 