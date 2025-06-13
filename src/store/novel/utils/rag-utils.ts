/**
 * 检索增强生成 (RAG) 相关工具函数
 */

import { Voy, type SearchResult, type Neighbor } from 'voy-search';
import { EmbeddingPipeline } from '@/lib/embeddings';

/**
 * 表示可被索引的文档
 */
export interface DocumentToIndex {
  id: string;
  title: string;
  text: string;
}

/**
 * 表示检索到的文档结果
 */
export interface RetrievedDocument {
  id: string;
  title: string;
  text: string;
}

/**
 * 使用向量检索增强生成上下文
 * @param index - Voy向量索引
 * @param documents - 索引对应的文档列表
 * @param query - 检索查询
 * @param limit - 返回结果数量限制
 * @returns 检索到的相关上下文
 */
export const retrieveRelevantContext = async (
  index: Voy | null,
  documents: DocumentToIndex[],
  query: string,
  limit: number = 3
): Promise<string> => {
  if (!index || documents.length === 0) {
    console.log("[RAG] 向量索引或文档为空，跳过检索");
    return "";
  }

  try {
    // 使用EmbeddingPipeline对查询进行向量化
    const queryEmbedding = await EmbeddingPipeline.embed(query);
    
    // 使用Voy进行向量检索
    // 根据voy-search的API，search方法返回的是包含neighbors数组的SearchResult对象
    const searchResult: SearchResult = index.search(queryEmbedding as unknown as Float32Array, limit);
    
    if (!searchResult || !searchResult.neighbors || searchResult.neighbors.length === 0) {
      console.log("[RAG] 未找到相关内容");
      return "";
    }
    
    // 将检索结果与原始文档匹配
    const retrievedDocs: RetrievedDocument[] = searchResult.neighbors
      .map((neighbor: Neighbor) => {
        const docId = neighbor.id;
        const doc = documents.find(d => d.id === docId);
        if (!doc) return null;
        
        return {
          id: doc.id,
          title: doc.title,
          text: doc.text
        };
      })
      .filter(Boolean) as RetrievedDocument[];
    
    // 格式化检索结果为字符串
    let contextText = "【检索到的相关上下文】\n";
    retrievedDocs.forEach((doc, index) => {
      contextText += `\n${index + 1}. ${doc.title}\n${doc.text}\n`;
    });
    
    console.log(`[RAG] 成功检索到 ${retrievedDocs.length} 条相关内容`);
    return contextText;
  } catch (error) {
    console.error("[RAG] 检索失败:", error);
    return "";
  }
};

/**
 * 格式化检索结果为生成提示
 * @param retrievedContext - 检索到的上下文
 * @returns 格式化后的提示
 */
export const formatRetrievedContextForPrompt = (retrievedContext: string): string => {
  if (!retrievedContext) return "";
  
  return `
以下是从小说的历史章节、角色设定和情节线索中检索到的相关信息，请参考这些信息确保内容的连贯性和一致性：

${retrievedContext}

请确保你生成的内容与上述检索到的信息保持一致，特别是角色设定、已发生的事件和情节发展。
`;
}; 