'use client';

import { pipeline, type FeatureExtractionPipeline, type PipelineType } from '@huggingface/transformers';
import { ModelLoadStatus } from '@/store/use-app-status-store';

export class ModelLoader {
  private static model = 'Xenova/all-MiniLM-L6-v2';
  private static task: PipelineType = 'feature-extraction';
  private static instance: FeatureExtractionPipeline | null = null;
  private static loadingPromise: Promise<FeatureExtractionPipeline> | null = null;

  static async load(
    onStatusChange: (status: ModelLoadStatus) => void,
    onProgress: (progress: number) => void
  ): Promise<FeatureExtractionPipeline> {
    if (this.instance) {
      onStatusChange(ModelLoadStatus.LOADED);
      onProgress(100);
      return this.instance;
    }

    if (this.loadingPromise) {
      onStatusChange(ModelLoadStatus.LOADING);
      return this.loadingPromise;
    }

    onStatusChange(ModelLoadStatus.LOADING);
    this.loadingPromise = new Promise((resolve, reject) => {
      pipeline(this.task, this.model, {
        progress_callback: (progress: any) => {
          onProgress(progress.progress);
        },
      }).then((pipe) => {
        this.instance = pipe as FeatureExtractionPipeline;
        onStatusChange(ModelLoadStatus.LOADED);
        onProgress(100);
        this.loadingPromise = null;
        resolve(this.instance);
      }).catch(error => {
        console.error("Failed to load embedding model:", error);
        onStatusChange(ModelLoadStatus.FAILED);
        this.loadingPromise = null;
        reject(error);
      });
    });

    return this.loadingPromise;
  }
  
  static getInstance(): FeatureExtractionPipeline | null {
    return this.instance;
  }
} 