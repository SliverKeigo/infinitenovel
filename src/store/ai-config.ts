import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { db } from '@/lib/db';
import { AIConfig } from '@/types/ai-config';

interface AIConfigStore {
  activeConfigId: number | null;
  setActiveConfigId: (id: number | null) => void;
  addConfig: (config: Omit<AIConfig, 'id'>) => Promise<void>;
  updateConfig: (id: number, config: Partial<AIConfig>) => Promise<void>;
  deleteConfig: (id: number) => Promise<void>;
}

export const useAIConfigStore = create<AIConfigStore>()(
  persist(
    (set, get) => ({
      activeConfigId: null,
      setActiveConfigId: (id) => {
        const currentActiveId = get().activeConfigId;
        // If clicking the currently active one, deactivate it.
        if (currentActiveId === id) {
          set({ activeConfigId: null });
        } else {
          // Otherwise, activate the new one.
          set({ activeConfigId: id });
        }
      },
      addConfig: async (config) => {
        await db.aiConfigs.add(config as AIConfig);
      },
      updateConfig: async (id, config) => {
        await db.aiConfigs.update(id, config);
      },
      deleteConfig: async (id) => {
        // If deleting the active config, set active to null
        if (get().activeConfigId === id) {
          set({ activeConfigId: null });
        }
        await db.aiConfigs.delete(id);
      },
    }),
    {
      name: 'ai-config-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
      partialize: (state) => ({ activeConfigId: state.activeConfigId }), // only persist the activeConfigId
    }
  )
); 