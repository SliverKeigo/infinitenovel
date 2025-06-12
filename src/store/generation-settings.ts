import { create } from 'zustand';
import { db } from '@/lib/db';
import { GenerationSettings, PresetName } from '@/types/generation-settings';

const initialState: GenerationSettings = {
  id: 1,
  maxTokens: 4096,
  segmentsPerChapter: 3,
  temperature: 0.7,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0.2,
  characterCreativity: 0.6,
  contextChapters: 3,
};

const presets: Record<PresetName, Omit<GenerationSettings, 'id'>> = {
  'Default': {
    maxTokens: 4096,
    segmentsPerChapter: 3,
    temperature: 0.7,
    topP: 1,
    frequencyPenalty: 0.2,
    presencePenalty: 0.2,
    characterCreativity: 0.6,
    contextChapters: 3,
  },
  'Creativity First': {
    maxTokens: 4096,
    segmentsPerChapter: 3,
    temperature: 0.9,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0.5,
    characterCreativity: 0.9,
    contextChapters: 2,
  },
  'Logic First': {
    maxTokens: 8000,
    segmentsPerChapter: 2,
    temperature: 0.4,
    topP: 0.9,
    frequencyPenalty: 0.3,
    presencePenalty: 0.3,
    characterCreativity: 0.4,
    contextChapters: 5,
  },
  'Long-form Novel': {
    maxTokens: 8191,
    segmentsPerChapter: 4,
    temperature: 0.75,
    topP: 1,
    frequencyPenalty: 0.1,
    presencePenalty: 0.1,
    characterCreativity: 0.5,
    contextChapters: 6,
  },
  'Short Story': {
    maxTokens: 4096,
    segmentsPerChapter: 2,
    temperature: 0.8,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    characterCreativity: 0.7,
    contextChapters: 1,
  },
};

interface GenerationSettingsStore {
  updateSettings: (settings: Partial<Omit<GenerationSettings, 'id'>>) => Promise<void>;
  applyPreset: (presetName: PresetName) => Promise<void>;
  getSettings: () => Promise<GenerationSettings>;
  initializeSettings: () => Promise<void>;
}

export const useGenerationSettingsStore = create<GenerationSettingsStore>((set) => ({
  updateSettings: async (settings) => {
    const existingSettings = await db.generationSettings.get(1) || initialState;
    await db.generationSettings.put({ ...existingSettings, ...settings, id: 1 });
  },
  applyPreset: async (presetName) => {
    const presetSettings = presets[presetName];
    if (presetSettings) {
      await db.generationSettings.put({ ...presetSettings, id: 1 });
    }
  },
  getSettings: async () => {
    const settings = await db.generationSettings.get(1);
    if (!settings) {
      return { ...presets['Default'], id: 1 };
    }
    return settings;
  },
  initializeSettings: async () => {
    const settings = await db.generationSettings.get(1);
    if (!settings) {
      console.log('未找到生成设置，正在初始化为默认值...');
      await db.generationSettings.put({ ...presets['Default'], id: 1 });
    }
  }
}));

export const defaultSettings = presets['Default']; 