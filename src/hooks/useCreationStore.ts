import { create } from 'zustand';

interface NovelSettings {
  title: string;
  summary: string;
  presetChapters: number;
  category: string;
  subCategory: string;
}


interface CreationState {
  novelSettings: NovelSettings;
  generatedContent: string;
  isGenerating: boolean;
  progress: number;

  setNovelSettings: (settings: Partial<NovelSettings>) => void;
  startGeneration: () => void;
  appendGeneratedContent: (chunk: string) => void;
  finishGeneration: () => void;
  setProgress: (progress: number) => void;
  resetCreation: () => void;
}

const initialState = {
  novelSettings: {
    title: "",
    summary: "",
    presetChapters: 100,
    category: "",
    subCategory: "",
  },
  generatedContent: "",
  isGenerating: false,
  progress: 0,
};

export const useCreationStore = create<CreationState>((set) => ({
  ...initialState,

  setNovelSettings: (settings) =>
    set((state) => ({
      novelSettings: { ...state.novelSettings, ...settings },
    })),


  startGeneration: () => set({ isGenerating: true, progress: 0, generatedContent: "" }),

  appendGeneratedContent: (chunk) =>
    set((state) => ({
      generatedContent: state.generatedContent + chunk,
    })),

  finishGeneration: () => set({ isGenerating: false, progress: 100 }),

  setProgress: (progress) => set({ progress }),
  
  resetCreation: () => set(initialState),
}));
