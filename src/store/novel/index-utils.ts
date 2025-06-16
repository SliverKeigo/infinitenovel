/**
 * 小说向量索引管理工具
 */
import { Voy } from 'voy-search';
import { EmbeddingPipeline } from '@/lib/embeddings';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';
import { saveVectorIndex } from './utils/rag-utils';
import { toast } from "sonner";

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
    console.log(`[RAG] 开始为小说 ${id} 构建向量索引`);
    const fetchedData = await get().fetchNovelDetails(id);

    if (!fetchedData) {
      throw new Error('获取小说数据失败，无法构建索引。');
    }

    const { chapters, characters } = fetchedData;
    
    const plotCluesResponse = await fetch(`/api/plot-clues?novel_id=${id}`);
    if (!plotCluesResponse.ok) {
      throw new Error('获取剧情线索失败');
    }
    const plotClues = await plotCluesResponse.json();

    interface DocumentToIndex {
      id: string;
      title: string;
      text: string;
    }

    const documentsToIndex: DocumentToIndex[] = [];

    // 添加章节内容到索引
    chapters.forEach((c: Chapter) => {
      if (c.content || c.summary) {
        documentsToIndex.push({
          id: `chapter-${c.id}`,
          title: `第${c.chapter_number}章`,
          text: c.summary || c.content.substring(0, 500)
        });
      }
    });

    // 添加角色信息到索引
    characters.forEach((c: Character) => {
      if (c.name) {
        documentsToIndex.push({
          id: `character-${c.id}`,
          title: c.name,
          text: `姓名: ${c.name}, 核心设定: ${c.core_setting || ''}, 性格: ${c.personality || ''}, 背景: ${c.background_story || ''}`
        });
      }
    });

    // 添加剧情线索到索引
    plotClues.forEach((p: PlotClue) => {
      if (p.title && p.description) {
        documentsToIndex.push({
          id: `plot-${p.id}`,
          title: p.title,
          text: p.description
        });
      }
    });

    set({ currentNovelDocuments: documentsToIndex });

    if (documentsToIndex.length === 0) {
      console.log(`[RAG] 小说 ${id} 没有可索引的内容，创建空索引`);
      const emptyIndex = new Voy();
      set({ currentNovelIndex: emptyIndex, indexLoading: false });
      
      // 保存空索引
      try {
        await saveVectorIndex(id, emptyIndex);
        console.log(`[RAG] 成功为小说 ${id} 保存了空向量索引`);
      } catch (e) {
        console.error(`[RAG] 保存空向量索引失败:`, e);
      }
      
      onSuccess?.();
      return;
    }

    console.log(`[RAG] 开始为 ${documentsToIndex.length} 个文档生成向量嵌入`);
    const embeddings = await EmbeddingPipeline.embed(documentsToIndex.map(d => d.text));

    const dataForVoy = documentsToIndex.map((doc, i) => ({
      id: doc.id,
      title: doc.title,
      url: `#${doc.id}`,
      embeddings: embeddings[i],
    }));

    console.log(`[RAG] 创建新的向量索引`);
    const newIndex = new Voy({ embeddings: dataForVoy });

    set({ currentNovelIndex: newIndex, indexLoading: false });

    // 将新创建的索引持久化到数据库
    try {
      await saveVectorIndex(id, newIndex);
      console.log(`[RAG] 成功为小说 ${id} 保存了向量索引`);
    } catch (e) {
      console.error(`[RAG] 保存向量索引失败:`, e);
      // 虽然保存失败，但索引已经构建完成，所以不抛出错误
      toast.error("向量索引保存失败，但不影响当前会话的使用");
    }

    onSuccess?.();

  } catch (error) {
    console.error('[RAG] 构建向量索引失败:', error);
    set({ indexLoading: false });
    toast.error(`构建向量索引失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}; 