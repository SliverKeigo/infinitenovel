'use client';

import { pipeline, type FeatureExtractionPipeline, type PipelineType } from '@huggingface/transformers';
import { ModelLoadStatus } from '@/store/use-app-status-store';

export class ModelLoader {
  private static model = 'Xenova/all-MiniLM-L6-v2';
  private static task: PipelineType = 'feature-extraction';
  private static instance: FeatureExtractionPipeline | null = null;
  private static loadingPromise: Promise<FeatureExtractionPipeline> | null = null;
  private static maxRetries = 3;
  private static retryDelay = 1000;

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
    this.loadingPromise = new Promise(async (resolve, reject) => {
      let retryCount = 0;
      
      while (retryCount < this.maxRetries) {
        try {
          console.log(`[模型加载器] 尝试加载模型 (尝试 ${retryCount + 1}/${this.maxRetries})`);
          
          const pipe = await pipeline(this.task, this.model, {
            progress_callback: (progress: any) => {
              onProgress(progress.progress);
            },
          });
          
          this.instance = pipe as FeatureExtractionPipeline;
          onStatusChange(ModelLoadStatus.LOADED);
          onProgress(100);
          this.loadingPromise = null;
          console.log('[模型加载器] 模型加载成功');
          resolve(this.instance);
          return;
        } catch (error) {
          console.error(`[模型加载器] 加载失败 (尝试 ${retryCount + 1}/${this.maxRetries}):`, error);
          
          if (retryCount < this.maxRetries - 1) {
            retryCount++;
            console.log(`[模型加载器] 等待 ${this.retryDelay}ms 后重试...`);
            await new Promise(r => setTimeout(r, this.retryDelay));
            this.retryDelay *= 2; // 指数退避
          } else {
            console.error('[模型加载器] 达到最大重试次数，放弃加载');
            onStatusChange(ModelLoadStatus.FAILED);
            this.loadingPromise = null;
            reject(error);
            return;
          }
        }
      }
    });

    return this.loadingPromise;
  }
  
  static getInstance(): FeatureExtractionPipeline | null {
    return this.instance;
  }

  static reset(): void {
    this.instance = null;
    this.loadingPromise = null;
    this.retryDelay = 1000; // 重置重试延迟
  }
} 