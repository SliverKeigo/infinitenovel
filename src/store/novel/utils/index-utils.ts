/**
 * 小说向量索引管理工具
 */
import type { StoreApi } from 'zustand';
import {
  Voy,
  type SearchResult
} from 'voy-search';
import { EmbeddingPipeline } from '@/lib/embeddings';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';
import { saveVectorIndex, deleteVectorIndex as deleteIndexFile } from './rag-utils';
import { toast } from "sonner";
import type { NovelState } from '../../use-novel-store';
import { voyInitializer } from '@/lib/voy-initializer';

interface DocumentToIndex {
  id: string;
  title: string;
  text: string;
}

/**
 * 格式化向量数据为 Voy 所需的 Resource 格式
 */
const formatVoyResource = (docs: DocumentToIndex[], embeddings: number[][]) => {
  const resourceEmbeddings = docs.map((doc, index) => {
    return {
      id: doc.id,
      title: doc.title,
      url: `/docs/${doc.id}`, // 根据官方文档，url是必需的
      embeddings: embeddings[index] // 根据官方文档，应为 number[]
    };
  });

  return { embeddings: resourceEmbeddings };
};

/**
 * 验证向量数据
 */
const validateEmbeddings = (embeddings: number[][]): boolean => {
  if (!Array.isArray(embeddings) || embeddings.length === 0) {
    throw new Error('向量数据无效：嵌入向量数组为空。');
  }

  const dimension = embeddings[0].length;
  if (dimension === 0) {
    throw new Error('向量数据无效：嵌入向量维度为0。');
  }

  embeddings.forEach((embedding, index) => {
    if (!Array.isArray(embedding) || embedding.length !== dimension) {
      throw new Error(`向量 #${index} 维度不一致: 期望维度 ${dimension}，实际为 ${embedding.length}。`);
    }

    const hasInvalidValue = embedding.some(value =>
      typeof value !== 'number' ||
      Number.isNaN(value) ||
      !Number.isFinite(value)
    );

    if (hasInvalidValue) {
      throw new Error(`向量 #${index} 包含无效的非数字或无穷大值。`);
    }

    const isZeroVector = embedding.every(value => value === 0);
    if (isZeroVector) {
      throw new Error(`向量 #${index} 是一个无效的零向量，可能由空文本生成。`);
    }
  });

  return true;
};

/**
 * 创建 Voy 索引实例 (底层)
 */
const createVoyIndex = async (
  documents: DocumentToIndex[],
  embeddings: number[][]
): Promise<Voy | null> => {
  try {
    // 等待Wasm模块可靠地初始化
    await voyInitializer.ready();

    if (!validateEmbeddings(embeddings)) {
      throw new Error('向量数据验证失败');
    }

    const resource = formatVoyResource(documents, embeddings);

    // 严格遵循官方文档的用法，传递完整的Resource对象
    const voyIndex = new Voy(resource);

    // search方法的查询向量需要是 Float32Array
    const testQuery = new Float32Array(embeddings[0].length).fill(0);
    const testResult = voyIndex.search(testQuery, 1) as SearchResult;
    if (!testResult || !testResult.neighbors || testResult.neighbors.length === 0) {
      throw new Error('索引验证失败');
    }

    return voyIndex;
  } catch (error: any) {
    console.error('[RAG] 创建 Voy 实例失败:', error);
    // 重新抛出错误，以便上层可以捕获并显示更详细的信息
    throw new Error(`创建Voy实例时发生底层错误: ${error.message || error}`);
  }
}

/**
 * 构建并保存小说向量索引 (高层)
 */
export async function buildNovelIndex(
  get: StoreApi<NovelState>['getState'],
  set: StoreApi<NovelState>['setState'],
  novelId: number,
  onSuccess?: () => void
): Promise<void> {
  set({ indexLoading: true });
  const toastId = `rag-build-${novelId}`;
  toast.info('开始构建小说知识库...', { id: toastId });

  try {
    // 1. 获取所有需要被索引的内容
    const response = await fetch(`/api/novels/${novelId}/content-for-rag`);
    if (!response.ok) {
      throw new Error(`获取小说内容失败: ${response.statusText}`);
    }
    const { chapters, characters, plotClues } = await response.json() as {
      chapters: Chapter[];
      characters: Character[];
      plotClues: PlotClue[];
    };

    const documents: DocumentToIndex[] = [];
    characters.forEach(c => documents.push({ id: `char_${c.id}`, title: `角色: ${c.name}`, text: c.description }));
    plotClues.forEach(p => documents.push({ id: `clue_${p.id}`, title: `线索: ${p.title}`, text: p.description }));

    if (documents.length === 0) {
      toast.warning('没有可供索引的内容，已跳过知识库构建。', { id: toastId });
      return;
    }

    // 2. 生成向量
    const textsToEmbed = documents.map(d => `${d.title}\n${d.text}`);

    // 使用 EmbeddingPipeline 统一处理
    const embeddings = await EmbeddingPipeline.embed(textsToEmbed);

    // 3. 创建索引
    const voyIndex = await createVoyIndex(documents, embeddings);
    if (!voyIndex) {
      throw new Error('创建向量索引实例失败');
    }

    // 4. 保存索引
    await saveVectorIndex(novelId, voyIndex);

    // 5. 更新Store
    set({
      currentNovelIndex: voyIndex,
      currentNovelDocuments: documents,
    });

    toast.success('小说知识库构建完成！', { id: toastId });
    if (onSuccess) onSuccess();

  } catch (error: any) {
    console.error('[RAG] 构建向量索引失败:', error);
    toast.error(`构建知识库失败: ${error.message}`, { id: toastId });
    set({ currentNovelIndex: null, currentNovelDocuments: [] });
  } finally {
    set({ indexLoading: false });
  }
}

/**
 * 删除指定小说的向量索引
 */
export const deleteVectorIndex = async (
  get: StoreApi<NovelState>['getState'],
  set: StoreApi<NovelState>['setState'],
  novelId: number
) => {
  try {
    await deleteIndexFile(novelId);
    set({ currentNovelIndex: null, currentNovelDocuments: [] });
    toast.success('小说知识库已成功删除');
  } catch (error: any) {
    console.error(`[RAG] 删除向量索引失败:`, error);
    toast.error(`删除知识库失败: ${error.message}`);
  }
}; 