export const PRESET_NAMES = [
  'Balanced Mode',
  'Creativity First',
  'Logic First',
  'Long-form Novel',
  'Short Story',
] as const;

export type PresetName = typeof PRESET_NAMES[number];

export interface GenerationSettings {
  id?: 1; // Singleton ID
  chapterWordCount: number;
  temperature: number;
  maxTokens: number;
  maxCharacterCount: number;
  characterCreativity: number;
  contextChapters: number;
} 