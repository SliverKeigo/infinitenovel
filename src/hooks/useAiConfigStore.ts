import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { ModelConfig, ModelType } from "@/types/ai";
import { nanoid } from "nanoid";

interface AiConfigState {
  models: ModelConfig[];
  activeGenerationModelId: string | null;
  activeEmbeddingModelId: string | null;

  addModel: (model: Omit<ModelConfig, "id">) => void;
  updateModel: (id: string, model: Partial<Omit<ModelConfig, "id">>) => void;
  deleteModel: (id: string) => void;
  setActiveModel: (id: string, type: ModelType) => void;

  getActiveGenerationModel: () => ModelConfig | undefined;
  getActiveEmbeddingModel: () => ModelConfig | undefined;
}

export const useAiConfigStore = create<AiConfigState>()(
  persist(
    (set, get) => ({
      models: [],
      activeGenerationModelId: null,
      activeEmbeddingModelId: null,

      addModel: (model) =>
        set((state) => ({
          models: [...state.models, { ...model, id: nanoid() }],
        })),

      updateModel: (id, modelUpdate) =>
        set((state) => ({
          models: state.models.map((model) =>
            model.id === id ? { ...model, ...modelUpdate } : model,
          ),
        })),

      deleteModel: (id) =>
        set((state) => ({
          models: state.models.filter((model) => model.id !== id),
          // Also deactivate if the deleted model was active
          activeGenerationModelId:
            state.activeGenerationModelId === id
              ? null
              : state.activeGenerationModelId,
          activeEmbeddingModelId:
            state.activeEmbeddingModelId === id
              ? null
              : state.activeEmbeddingModelId,
        })),

      setActiveModel: (id, type) => {
        if (type === "generation") {
          set({ activeGenerationModelId: id });
        } else if (type === "embedding") {
          set({ activeEmbeddingModelId: id });
        }
      },

      getActiveGenerationModel: () => {
        const { models, activeGenerationModelId } = get();
        return models.find((m) => m.id === activeGenerationModelId);
      },

      getActiveEmbeddingModel: () => {
        const { models, activeEmbeddingModelId } = get();
        return models.find((m) => m.id === activeEmbeddingModelId);
      },
    }),
    {
      name: "ai-config-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
