export interface AIConfig {
  id?: number;
  name: string;
  apiKey: string;
  model: string;
  apiBaseUrl?: string;
  useApiForEmbeddings: boolean;
  embeddingModel: string;
  useIndependentEmbeddingConfig: boolean;
  embeddingApiKey?: string;
  embeddingApiBaseUrl?: string;
}

export type EmbeddingSource = 'browser' | 'api';

export interface EmbeddingConfig {
  source: EmbeddingSource;
  model: string;
  apiKey?: string;
  apiBaseUrl?: string;
} 