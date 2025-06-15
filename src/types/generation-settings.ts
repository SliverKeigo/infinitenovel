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
  max_tokens: number;
  segments_per_chapter: number;
  temperature: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  character_creativity: number;
} 