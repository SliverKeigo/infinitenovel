export interface AIConfig {
  id?: number;
  name: string;
  api_key: string;
  model: string;
  api_base_url?: string;
  vision_model?: string;
  use_api_for_embeddings: boolean;
  embedding_model: string;
  use_independent_embedding_config: boolean;
  embedding_api_key?: string;
  embedding_api_base_url?: string;
  created_at?: string;
  updated_at?: string;
}

export type EmbeddingSource = 'browser' | 'api';

export interface EmbeddingConfig {
  source: EmbeddingSource;
  model: string;
  apiKey?: string;
  apiBaseUrl?: string;
}