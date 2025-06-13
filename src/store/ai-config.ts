import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { db } from '@/lib/db';
import { AIConfig, EmbeddingConfig, EmbeddingSource } from '@/types/ai-config';

interface AIConfigStore {
  activeConfigId: number | null;
  useApiForEmbeddings: boolean;
  embeddingModel: string;
  useIndependentEmbeddingConfig: boolean;
  embeddingApiKey: string | null;
  embeddingApiBaseUrl: string | null;
  setActiveConfigId: (id: number | null) => void;
  addConfig: (config: Omit<AIConfig, 'id'>) => Promise<void>;
  updateConfig: (id: number, config: Partial<AIConfig>) => Promise<void>;
  deleteConfig: (id: number) => Promise<void>;
  setUseApiForEmbeddings: (useApi: boolean) => void;
  setEmbeddingModel: (model: string) => void;
  setUseIndependentEmbeddingConfig: (useIndependent: boolean) => void;
  setEmbeddingApiKey: (apiKey: string | null) => void;
  setEmbeddingApiBaseUrl: (apiBaseUrl: string | null) => void;
  getEmbeddingConfig: () => EmbeddingConfig;
}

// 默认的嵌入模型
const DEFAULT_BROWSER_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_API_EMBEDDING_MODEL = 'text-embedding-ada-002';

export const useAIConfigStore = create<AIConfigStore>()(
  persist(
    (set, get) => ({
      activeConfigId: null,
      useApiForEmbeddings: false,
      embeddingModel: DEFAULT_BROWSER_EMBEDDING_MODEL,
      useIndependentEmbeddingConfig: false,
      embeddingApiKey: null,
      embeddingApiBaseUrl: null,
      
      setActiveConfigId: (id) => {
        const currentActiveId = get().activeConfigId;
        // If clicking the currently active one, deactivate it.
        if (currentActiveId === id) {
          set({ activeConfigId: null });
        } else {
          // Otherwise, activate the new one.
          set({ activeConfigId: id });
        }
      },
      
      addConfig: async (config) => {
        // 确保新配置包含嵌入模型设置
        const configWithDefaults = {
          ...config,
          useApiForEmbeddings: config.useApiForEmbeddings ?? false,
          embeddingModel: config.embeddingModel ?? DEFAULT_API_EMBEDDING_MODEL,
          useIndependentEmbeddingConfig: config.useIndependentEmbeddingConfig ?? false,
          embeddingApiKey: config.embeddingApiKey ?? '',
          embeddingApiBaseUrl: config.embeddingApiBaseUrl ?? ''
        };
        await db.aiConfigs.add(configWithDefaults as AIConfig);
      },
      
      updateConfig: async (id, config) => {
        await db.aiConfigs.update(id, config);
      },
      
      deleteConfig: async (id) => {
        // If deleting the active config, set active to null
        if (get().activeConfigId === id) {
          set({ activeConfigId: null });
        }
        await db.aiConfigs.delete(id);
      },
      
      setUseApiForEmbeddings: (useApi) => {
        // 切换嵌入源时，自动切换默认模型
        const embeddingModel = useApi ? 
          DEFAULT_API_EMBEDDING_MODEL : 
          DEFAULT_BROWSER_EMBEDDING_MODEL;
        
        set({ 
          useApiForEmbeddings: useApi,
          embeddingModel
        });
      },
      
      setEmbeddingModel: (model) => {
        set({ embeddingModel: model });
      },
      
      setUseIndependentEmbeddingConfig: (useIndependent) => {
        set({ useIndependentEmbeddingConfig: useIndependent });
      },
      
      setEmbeddingApiKey: (apiKey) => {
        set({ embeddingApiKey: apiKey });
      },
      
      setEmbeddingApiBaseUrl: (apiBaseUrl) => {
        set({ embeddingApiBaseUrl: apiBaseUrl });
      },
      
      getEmbeddingConfig: () => {
        const { 
          useApiForEmbeddings, 
          embeddingModel, 
          activeConfigId,
          useIndependentEmbeddingConfig,
          embeddingApiKey,
          embeddingApiBaseUrl
        } = get();
        
        // 如果不使用API，返回浏览器嵌入配置
        if (!useApiForEmbeddings) {
          return {
            source: 'browser' as EmbeddingSource,
            model: embeddingModel || DEFAULT_BROWSER_EMBEDDING_MODEL
          };
        }
        
        // 如果使用独立的API配置
        if (useIndependentEmbeddingConfig) {
          // 如果没有设置独立的API密钥，回退到浏览器嵌入
          if (!embeddingApiKey) {
            console.warn('使用独立API配置进行嵌入但未设置API密钥，回退到浏览器嵌入');
            return {
              source: 'browser' as EmbeddingSource,
              model: DEFAULT_BROWSER_EMBEDDING_MODEL
            };
          }
          
          return {
            source: 'api' as EmbeddingSource,
            model: embeddingModel || DEFAULT_API_EMBEDDING_MODEL,
            apiKey: embeddingApiKey,
            apiBaseUrl: embeddingApiBaseUrl || undefined
          };
        }
        
        // 如果使用API但没有激活的配置，返回浏览器嵌入配置
        if (!activeConfigId) {
          console.warn('使用API进行嵌入但未设置活动配置，回退到浏览器嵌入');
          return {
            source: 'browser' as EmbeddingSource,
            model: DEFAULT_BROWSER_EMBEDDING_MODEL
          };
        }
        
        // 使用当前激活的配置
        return {
          source: 'api' as EmbeddingSource,
          model: embeddingModel || DEFAULT_API_EMBEDDING_MODEL,
          apiKey: '使用活动配置的API密钥', // 实际使用时需要从db获取
          apiBaseUrl: '使用活动配置的API基础URL' // 实际使用时需要从db获取
        };
      }
    }),
    {
      name: 'ai-config-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
      partialize: (state) => ({ 
        activeConfigId: state.activeConfigId,
        useApiForEmbeddings: state.useApiForEmbeddings,
        embeddingModel: state.embeddingModel,
        useIndependentEmbeddingConfig: state.useIndependentEmbeddingConfig,
        embeddingApiKey: state.embeddingApiKey,
        embeddingApiBaseUrl: state.embeddingApiBaseUrl
      }), // 持久化嵌入模型相关设置
    }
  )
); 