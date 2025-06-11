import { ModelLoader } from './model-loader';

type Pooling = 'mean' | 'none' | 'cls';

class EmbeddingPipelineSingleton {
  static async embed(text: string | string[], options: { pooling: Pooling; normalize: boolean } = { pooling: 'mean', normalize: true }) {
    const extractor = ModelLoader.getInstance();
    if (!extractor) {
      throw new Error("Embedding model is not loaded. Please ensure it's loaded before calling embed.");
    }
    const output = await extractor(text, options);
    return output.tolist();
  }
}

export const EmbeddingPipeline = EmbeddingPipelineSingleton; 