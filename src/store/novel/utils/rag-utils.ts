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
 * 保存向量索引到数据库
 * @param novelId - 小说ID
 * @param index - Voy向量索引
 * @param maxRetries - 最大重试次数
 */
export const saveVectorIndex = async (
  novelId: number, 
  index: Voy,
  maxRetries: number = 3
): Promise<void> => {
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount < maxRetries) {
    try {
      console.log(`[RAG] 开始保存小说 ${novelId} 的向量索引 (尝试 ${retryCount + 1}/${maxRetries})`);
      
      // 序列化索引
      const serializedIndex = index.serialize();
      
      // 发送到后端API
      const response = await fetch(`/api/novels/${novelId}/vector-index`, {
        method: 'PUT',
        body: serializedIndex,
        headers: {
          'Content-Type': 'text/plain'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`保存向量索引失败: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      console.log(`[RAG] 成功保存小说 ${novelId} 的向量索引 (ID: ${result.id})`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[RAG] 保存向量索引失败 (尝试 ${retryCount + 1}/${maxRetries}):`, error);
      
      if (retryCount < maxRetries - 1) {
        // 使用指数退避策略
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
      } else {
        break;
      }
    }
  }

  // 所有重试都失败了
  console.error(`[RAG] 保存向量索引失败，已达到最大重试次数 (${maxRetries})`);
  throw lastError || new Error('保存向量索引失败，已达到最大重试次数');
};

/**
 * 从数据库加载向量索引
 * @param novelId - 小说ID
 * @returns Voy向量索引，如果不存在则返回null
 */
export const loadVectorIndex = async (novelId: number): Promise<Voy | null> => {
  try {
    console.log(`[RAG] 开始加载小说 ${novelId} 的向量索引`);
    
    const response = await fetch(`/api/novels/${novelId}/vector-index`);
    
    if (response.status === 204) {
      console.log(`[RAG] 小说 ${novelId} 没有向量索引`);
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`加载向量索引失败: ${response.statusText}`);
    }

    // 获取Base64编码的数据
    const base64Data = await response.text();
    
    try {
      // 将Base64转换回二进制数据
      const binaryData = Buffer.from(base64Data, 'base64');
      
      // 反序列化数据到新的Voy实例
      const index = Voy.deserialize(binaryData.toString());
      
      console.log(`[RAG] 成功加载小说 ${novelId} 的向量索引`);
      return index;
    } catch (error) {
      console.error('[RAG] 向量索引反序列化失败:', error);
      throw new Error(`向量索引反序列化失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  } catch (error) {
    console.error('[RAG] 加载向量索引失败:', error);
    throw error;
  }
};

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