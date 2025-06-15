import { ModelLoader } from './model-loader';
import { useAIConfigStore } from '@/store/ai-config';
import { EmbeddingSource } from '@/types/ai-config';
import OpenAI from 'openai';
type Pooling = 'mean' | 'none' | 'cls';

/**
 * 嵌入服务接口
 */
interface EmbeddingService {
  embed(text: string | string[], options?: { pooling?: Pooling; normalize?: boolean }): Promise<number[][]>;
}

/**
 * 浏览器内置模型嵌入服务
 */
class BrowserEmbeddingService implements EmbeddingService {
  async embed(text: string | string[], options: { pooling?: Pooling; normalize?: boolean } = { pooling: 'mean', normalize: true }): Promise<number[][]> {
    const extractor = ModelLoader.getInstance();
    if (!extractor) {
      throw new Error("浏览器嵌入模型未加载。请确保在调用embed前已加载模型。");
    }
    const output = await extractor(text, options);
    return output.tolist();
  }
}

/**
 * OpenAI API嵌入服务
 */
class OpenAIEmbeddingService implements EmbeddingService {
  private apiKey: string;
  private model: string;
  private apiBaseUrl?: string;

  constructor(apiKey: string, model: string, apiBaseUrl?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.apiBaseUrl = apiBaseUrl;
  }

  async embed(text: string | string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error("OpenAI API密钥未设置。请在AI配置中设置有效的API密钥。");
    }

    const openai = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.apiBaseUrl,
      dangerouslyAllowBrowser: true,
    });

    // 确保文本是数组形式
    const textArray = Array.isArray(text) ? text : [text];

    try {
      const response = await openai.embeddings.create({
        model: this.model,
        input: textArray,
      });

      // 提取嵌入向量
      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error("OpenAI嵌入API调用失败:", error);
      throw new Error(`OpenAI嵌入生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
}

/**
 * 嵌入服务工厂，根据配置创建合适的嵌入服务
 */
class EmbeddingServiceFactory {
  static async createService(): Promise<EmbeddingService> {
    const store = useAIConfigStore.getState();
    const config = store.getEmbeddingConfig();

    if (config.source === 'browser') {
      return new BrowserEmbeddingService();
    } else if (config.source === 'api') {
      // 检查是否使用独立配置
      if (store.use_independent_embedding_config && store.embedding_api_key) {
        return new OpenAIEmbeddingService(
          store.embedding_api_key,
          store.embedding_model,
          store.embedding_api_base_url || undefined
        );
      }

      // 如果使用API但没有apiKey，尝试从数据库获取
      let apiKey = config.apiKey;
      let apiBaseUrl = config.apiBaseUrl;

      if (!apiKey) {
        const activeConfigId = store.activeConfigId;
        if (activeConfigId) {
          const activeConfigResponse = await fetch(`/api/ai-configs/${activeConfigId}`);
          const activeConfig = await activeConfigResponse.json();
          if (activeConfig) {
            apiKey = activeConfig.api_key;
            apiBaseUrl = activeConfig.api_base_url;
          }
        }
      }

      if (!apiKey) {
        console.warn("未找到有效的API密钥，回退到浏览器嵌入模型");
        return new BrowserEmbeddingService();
      }

      return new OpenAIEmbeddingService(apiKey, config.model, apiBaseUrl);
    }

    // 默认使用浏览器嵌入
    return new BrowserEmbeddingService();
  }
}

/**
 * 统一的嵌入管理类
 */
class EmbeddingManager {
  private static service: EmbeddingService | null = null;

  static async getService(): Promise<EmbeddingService> {
    if (!this.service) {
      this.service = await EmbeddingServiceFactory.createService();
    }
    return this.service;
  }

  static resetService() {
    this.service = null;
  }

  static async embed(text: string | string[], options: { pooling?: Pooling; normalize?: boolean } = { pooling: 'mean', normalize: true }): Promise<number[][]> {
    const service = await this.getService();
    return service.embed(text, options);
  }
}

// 导出统一的嵌入接口
export const EmbeddingPipeline = {
  embed: async (text: string | string[], options: { pooling?: Pooling; normalize?: boolean } = { pooling: 'mean', normalize: true }): Promise<number[][]> => {
    return EmbeddingManager.embed(text, options);
  },
  resetService: () => {
    EmbeddingManager.resetService();
  }
}; 