export const PRESET_NAMES = [
  'Default',
  'Creativity First',
  'Logic First',
  'Long-form Novel',
  'Short Story',
] as const;

export type PresetName = typeof PRESET_NAMES[number];

export interface GenerationSettings {
  id: number;
  maxTokens: number;
  segmentsPerChapter: number;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  characterCreativity: number;
  contextChapters: number;
} 