import { create } from 'zustand';
import { GenerationSettings, PresetName } from '@/types/generation-settings';
import { toast } from "sonner";

const defaultInitialState: GenerationSettings = {
  id: 1,
  max_tokens: 4096,
  segments_per_chapter: 3,
  temperature: 0.7,
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0.2,
  character_creativity: 0.6,
};

const presets: Record<PresetName, Omit<GenerationSettings, 'id'>> = {
  'Default': {
    max_tokens: 4096,
    segments_per_chapter: 3,
    temperature: 0.7,
    top_p: 1,
    frequency_penalty: 0.2,
    presence_penalty: 0.2,
    character_creativity: 0.6,
  },
  'Creativity First': {
    max_tokens: 4096,
    segments_per_chapter: 3,
    temperature: 0.9,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0.5,
    character_creativity: 0.9,
  },
  'Logic First': {
    max_tokens: 8000,
    segments_per_chapter: 2,
    temperature: 0.4,
    top_p: 0.9,
    frequency_penalty: 0.3,
    presence_penalty: 0.3,
    character_creativity: 0.4,
  },
  'Long-form Novel': {
    max_tokens: 8191,
    segments_per_chapter: 4,
    temperature: 0.75,
    top_p: 1,
    frequency_penalty: 0.1,
    presence_penalty: 0.1,
    character_creativity: 0.5,
  },
  'Short Story': {
    max_tokens: 4096,
    segments_per_chapter: 2,
    temperature: 0.8,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    character_creativity: 0.7,
  },
};

interface GenerationSettingsStore {
  settings: GenerationSettings;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<Omit<GenerationSettings, 'id'>>) => Promise<void>;
  applyPreset: (presetName: PresetName) => Promise<void>;
  getSettings: () => GenerationSettings;
}

export const useGenerationSettingsStore = create<GenerationSettingsStore>((set, get) => ({
  settings: defaultInitialState,
  fetchSettings: async () => {
    try {
      const response = await fetch('/api/generation-settings');
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      const settings = await response.json() as GenerationSettings;
      set({ settings });
    } catch (error) {
      console.error("Error fetching generation settings:", error);
    }
  },
  updateSettings: async (newSettings) => {
    try {
      const response = await fetch('/api/generation-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update settings' }));
        throw new Error(errorData.error);
      }
      const updatedSettings = await response.json() as GenerationSettings;
      set({ settings: updatedSettings });
    } catch (error) {
      console.error("Error updating generation settings:", error);
      throw error;
    }
  },
  applyPreset: async (presetName) => {
    const presetSettings = presets[presetName];
    if (presetSettings) {
      await get().updateSettings(presetSettings);
    }
  },
  getSettings: () => {
    return get().settings;
  },
}));

export const defaultSettings = presets['Default']; 