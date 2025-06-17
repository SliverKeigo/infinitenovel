/**
 * 检索增强生成 (RAG) 相关工具函数
 */

import { Voy, type SearchResult, type Neighbor } from 'voy-search';
import { EmbeddingPipeline } from '@/lib/embeddings';
import { toast } from 'sonner';

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
 * 检查 WebAssembly 是否可用
 */
const checkWebAssembly = (): boolean => {
  try {
    if (typeof WebAssembly === 'object' && 
        typeof WebAssembly.instantiate === 'function') {
      const module = new WebAssembly.Module(new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0
      ]));
      if (module instanceof WebAssembly.Module) {
        const instance = new WebAssembly.Instance(module);
        return instance instanceof WebAssembly.Instance;
      }
    }
  } catch (e) {
    return false;
  }
  return false;
};

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
    try {
      
    const serializedIndex = index.serialize();
    if (!serializedIndex || typeof serializedIndex !== 'string') {
      throw new Error('序列化失败或结果不是字符串');
        }

    // 验证数据在发送前是完好的
    Voy.deserialize(serializedIndex);

        const response = await fetch(`/api/novels/${novelId}/vector-index`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
      body: JSON.stringify({ data: serializedIndex }),
        });

        if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`保存向量索引失败: ${response.status} ${response.statusText} - ${errorText}`);
        }

    toast.success('知识库已成功构建并保存！');

      } catch (error) {
    console.error(`[RAG] 保存向量索引时发生错误:`, error);
    toast.error(`保存知识库失败: ${error instanceof Error ? error.message : '未知错误'}`);
    throw error;
  }
};

/**
 * 删除数据库中的向量索引
 * @param novelId - 小说ID
 */
export const deleteVectorIndex = async (novelId: number): Promise<void> => {
  try {

    const response = await fetch(`/api/novels/${novelId}/vector-index`, {
      method: 'DELETE',
    });
      
    if (!response.ok && response.status !== 404) {
      // 404 Not Found 是可接受的，意味着索引已经不存在
      throw new Error(`删除向量索引失败: ${response.status} ${response.statusText}`);
    }

  } catch (error) {
    console.error('[RAG] 删除向量索引失败:', error);
    throw error;
  }
};

/**
 * 从数据库加载向量索引
 * @param novelId - 小说ID
 * @returns Voy向量索引，如果不存在则返回null
 */
export const loadVectorIndex = async (novelId: number): Promise<Voy | null> => {
  try {
    
    const response = await fetch(`/api/novels/${novelId}/vector-index`);
    
    if (response.status === 204) {
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`加载向量索引失败: ${response.statusText}`);
    }

    try {
      const data = await response.json() as { data: string };
      
      if (!data || !data.data) {
        throw new Error('响应数据格式无效');
      }

      // 从 Base64 解码
      const binaryData = Buffer.from(data.data, 'base64');
      // 转换为二进制保真字符串
      const finalString = binaryData.toString('latin1');
      const index = Voy.deserialize(finalString);
      
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
  // 验证输入参数
  if (!query.trim()) {
    return "";
  }

  if (!index) {
    return "";
  }

  if (!documents || documents.length === 0) {
    return "";
  }

  try { 

    // 使用EmbeddingPipeline对查询进行向量化
    const queryEmbedding = await EmbeddingPipeline.embed(query);
    
    // 使用Voy进行向量检索
    const searchResult: SearchResult = index.search(queryEmbedding as unknown as Float32Array, limit);
    
    if (!searchResult || !searchResult.neighbors || searchResult.neighbors.length === 0) {
      return "";
    }
    
    // 将检索结果与原始文档匹配
    const retrievedDocs: RetrievedDocument[] = searchResult.neighbors
      .map((neighbor: Neighbor) => {
        const docId = neighbor.id;
        const doc = documents.find(d => d.id === docId);
        if (!doc) {
          return null;
        }
        
        return {
          id: doc.id,
          title: doc.title,
          text: doc.text
        };
      })
      .filter(Boolean) as RetrievedDocument[];
    
    if (retrievedDocs.length === 0) {
      return "";
    }

    // 格式化检索结果为字符串
    let contextText = "【检索到的相关上下文】\n";
    retrievedDocs.forEach((doc, index) => {
      contextText += `\n${index + 1}. ${doc.title}\n${doc.text}\n`;
    });
      
    return contextText;
  } catch (error) {
    console.error("[RAG] 检索失败:", error);
    // 在检索失败时返回空字符串，不中断生成流程
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