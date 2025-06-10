import { create } from 'zustand';

export enum ModelLoadStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  FAILED = 'FAILED',
}

interface AppStatusState {
  embeddingModelStatus: ModelLoadStatus;
  embeddingModelProgress: number;
  setEmbeddingModelStatus: (status: ModelLoadStatus) => void;
  setEmbeddingModelProgress: (progress: number) => void;
}

export const useAppStatusStore = create<AppStatusState>((set) => ({
  embeddingModelStatus: ModelLoadStatus.IDLE,
  embeddingModelProgress: 0,
  setEmbeddingModelStatus: (status) => set({ embeddingModelStatus: status }),
  setEmbeddingModelProgress: (progress) => set({ embeddingModelProgress: progress }),
})); 