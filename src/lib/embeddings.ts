import { pipeline, type FeatureExtractionPipeline, type PipelineType } from '@huggingface/transformers';
import { useAppStatusStore, ModelLoadStatus } from '@/store/use-app-status-store';

type Pooling = 'mean' | 'none' | 'cls';

class EmbeddingPipelineSingleton {
  private static instance: Promise<FeatureExtractionPipeline> | null = null;
  private static model = 'Xenova/all-MiniLM-L6-v2';
  private static task: PipelineType = 'feature-extraction';

  static async getInstance(): Promise<FeatureExtractionPipeline> {
    if (this.instance === null) {
      const setStatus = useAppStatusStore.getState().setEmbeddingModelStatus;
      const setProgress = useAppStatusStore.getState().setEmbeddingModelProgress;

      setStatus(ModelLoadStatus.LOADING);
      
      this.instance = pipeline(this.task, this.model, {
        progress_callback: (progress: any) => {
          setProgress(progress.progress);
        },
      }).then((pipe) => {
        setStatus(ModelLoadStatus.LOADED);  
        setProgress(100);
        return pipe as FeatureExtractionPipeline;
      }).catch(error => {
        console.error("Failed to load embedding model:", error);
        setStatus(ModelLoadStatus.FAILED);
        this.instance = null; // 允许重试
        throw error;
      });
    }
    return this.instance;
  }

  static async embed(text: string | string[], options: { pooling: Pooling; normalize: boolean } = { pooling: 'mean', normalize: true }) {
    const extractor = await this.getInstance();
    const output = await extractor(text, options);
    return output.tolist();
  }
}

export const EmbeddingPipeline = EmbeddingPipelineSingleton; 