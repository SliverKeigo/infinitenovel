import { create } from 'zustand';
import { db } from '@/lib/db';
import { GenerationSettings, PresetName, PRESET_NAMES } from '@/types/generation-settings';

const presets: Record<PresetName, Omit<GenerationSettings, 'id'>> = {
  'Balanced Mode': {
    chapterWordCount: 3000,
    temperature: 0.7,
    maxTokens: 2048,
    maxCharacterCount: 5,
    characterCreativity: 0.6,
    contextChapters: 3,
  },
  'Creativity First': {
    chapterWordCount: 3000,
    temperature: 0.95,
    maxTokens: 2048,
    maxCharacterCount: 7,
    characterCreativity: 0.9,
    contextChapters: 2,
  },
  'Logic First': {
    chapterWordCount: 3000,
    temperature: 0.4,
    maxTokens: 3072,
    maxCharacterCount: 4,
    characterCreativity: 0.4,
    contextChapters: 5,
  },
  'Long-form Novel': {
    chapterWordCount: 4000,
    temperature: 0.65,
    maxTokens: 8192,
    maxCharacterCount: 10,
    characterCreativity: 0.5,
    contextChapters: 6,
  },
  'Short Story': {
    chapterWordCount: 2000,
    temperature: 0.8,
    maxTokens: 1024,
    maxCharacterCount: 3,
    characterCreativity: 0.7,
    contextChapters: 1,
  },
};

interface GenerationSettingsStore {
  updateSettings: (settings: Partial<Omit<GenerationSettings, 'id'>>) => Promise<void>;
  applyPreset: (presetName: PresetName) => Promise<void>;
  getSettings: () => Promise<GenerationSettings | undefined>;
}

export const useGenerationSettingsStore = create<GenerationSettingsStore>((set) => ({
  updateSettings: async (settings) => {
    const existingSettings = await db.generationSettings.get(1) || defaultSettings;
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
        // If no settings exist, initialize with the default preset
        const defaultPreset = presets['Balanced Mode'];
        await db.generationSettings.put({ ...defaultPreset, id: 1 });
        return { ...defaultPreset, id: 1 };
    }
    return settings;
  }
}));

export const defaultSettings = presets['Balanced Mode']; 