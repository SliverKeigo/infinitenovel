import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AIConfig, EmbeddingConfig, EmbeddingSource } from '@/types/ai-config';
import { toast } from "sonner";

interface AIConfigStore {
  configs: AIConfig[];
  activeConfigId: number | null;
  use_api_for_embeddings: boolean;
  embedding_model: string;
  use_independent_embedding_config: boolean;
  embedding_api_key: string | null;
  embedding_api_base_url: string | null;
  loading: boolean;
  fetchConfigs: () => Promise<void>;
  setActiveConfigId: (id: number | null) => void;
  addConfig: (config: Omit<AIConfig, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
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
      configs: [],
      activeConfigId: null,
      use_api_for_embeddings: false,
      embedding_model: DEFAULT_BROWSER_EMBEDDING_MODEL,
      use_independent_embedding_config: false,
      embedding_api_key: null,
      embedding_api_base_url: null,
      loading: false,
      
      fetchConfigs: async () => {
        set({ loading: true });
        try {
          const response = await fetch('/api/ai-configs');
          if (!response.ok) {
            throw new Error('Failed to fetch AI configurations.');
          }
          const configs = await response.json() as AIConfig[];
          set({ configs, loading: false });
        } catch (error) {
          console.error(error);
          toast.error("加载AI配置失败。");
          set({ loading: false, configs: [] });
        }
      },

      setActiveConfigId: (id) => {
        const currentActiveId = get().activeConfigId;
        set({ activeConfigId: currentActiveId === id ? null : id });
      },
      
      addConfig: async (config) => {
        await fetch('/api/ai-configs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        await get().fetchConfigs();
      },
      
      updateConfig: async (id, config) => {
        await fetch(`/api/ai-configs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        await get().fetchConfigs();
      },
      
      deleteConfig: async (id) => {
        if (get().activeConfigId === id) {
          set({ activeConfigId: null });
        }
        await fetch(`/api/ai-configs/${id}`, { method: 'DELETE' });
        await get().fetchConfigs();
      },
      
      setUseApiForEmbeddings: (useApi) => {
        const embeddingModel = useApi 
          ? DEFAULT_API_EMBEDDING_MODEL 
          : DEFAULT_BROWSER_EMBEDDING_MODEL;
        set({ use_api_for_embeddings: useApi, embedding_model: embeddingModel });
      },
      
      setEmbeddingModel: (model) => set({ embedding_model: model }),
      setUseIndependentEmbeddingConfig: (useIndependent) => set({ use_independent_embedding_config: useIndependent }),
      setEmbeddingApiKey: (apiKey) => set({ embedding_api_key: apiKey }),
      setEmbeddingApiBaseUrl: (apiBaseUrl) => set({ embedding_api_base_url: apiBaseUrl }),
      
      getEmbeddingConfig: () => {
        const { 
          configs,
          use_api_for_embeddings, 
          embedding_model, 
          activeConfigId,
          use_independent_embedding_config,
          embedding_api_key,
          embedding_api_base_url
        } = get();
        
        if (!use_api_for_embeddings) {
          return { source: 'browser', model: embedding_model || DEFAULT_BROWSER_EMBEDDING_MODEL };
        }
        
        if (use_independent_embedding_config) {
          if (!embedding_api_key) {
            console.warn('Independent embedding API key not set, falling back to browser.');
            return { source: 'browser', model: DEFAULT_BROWSER_EMBEDDING_MODEL };
          }
          return { source: 'api', model: embedding_model || DEFAULT_API_EMBEDDING_MODEL, apiKey: embedding_api_key, apiBaseUrl: embedding_api_base_url || undefined };
        }
        
        const activeConfig = configs.find(c => c.id === activeConfigId);
        if (!activeConfig) {
          console.warn('Active AI config not found, falling back to browser for embedding.');
          return { source: 'browser', model: DEFAULT_BROWSER_EMBEDDING_MODEL };
        }
        
        return {
          source: 'api',
          model: activeConfig.embedding_model || DEFAULT_API_EMBEDDING_MODEL,
          apiKey: activeConfig.api_key,
          apiBaseUrl: activeConfig.api_base_url || undefined
        };
      }
    }),
    {
      name: 'ai-config-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
        activeConfigId: state.activeConfigId,
        use_api_for_embeddings: state.use_api_for_embeddings,
        embedding_model: state.embedding_model,
        use_independent_embedding_config: state.use_independent_embedding_config,
        embedding_api_key: state.embedding_api_key,
        embedding_api_base_url: state.embedding_api_base_url
      }),
    }
  )
); 