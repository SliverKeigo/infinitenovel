import { Dexie, type Table, type Transaction } from 'dexie';
import type { Novel } from '@/types/novel';
import type { AIConfig } from '@/types/ai-config';
import type { GenerationSettings } from '@/types/generation-settings';

// Note: SettingsProfile is not a type used in the stores, but seems to be a DB concept.
// If it's a mix of other types, it can be defined here.
// Based on the previous logic, it seems to be an extension of GenerationSettings.
export interface SettingsProfile extends GenerationSettings {
  name: string;
}

export class InfiniteNovelDatabase extends Dexie {
  aiConfigs!: Table<AIConfig>;
  generationSettings!: Table<GenerationSettings, number>; // Key is number
  novels!: Table<Novel>;
  
  // Note: The 'settingsProfiles' table seems redundant if it's just named GenerationSettings.
  // The logic in the generation-settings.ts store directly uses presets and a single settings object.
  // I will omit 'settingsProfiles' for now to align with the existing store logic.
  // If named profiles are a separate feature, we can add it back.

  constructor() {
    super('InfiniteNovelDatabase');

    // We combine all schema definitions into a single, final version
    // for simplicity and to avoid complex upgrade functions.
    this.version(1).stores({
      aiConfigs: '++id, &name',
      generationSettings: 'id', // id is always 1
      novels: '++id, name, genre, style, createdAt, updatedAt, totalChapterGoal, specialRequirements',
    });

    this.on('populate', this.populate);
  }

  private async populate(tx: Transaction) {
    // Populate AI Configs
    const aiCount = await tx.table('aiConfigs').count();
    if (aiCount === 0) {
      await tx.table('aiConfigs').add({
        name: '默认配置',
        provider: 'OpenAI',
        apiKey: '',
        model: 'gpt-4-turbo',
        apiBaseUrl: '',
      });
    }

    // Populate Generation Settings with a default
    const genSettingsCount = await tx.table('generationSettings').count();
    if (genSettingsCount === 0) {
      await tx.table('generationSettings').add({
        id: 1, // Always 1
        chapterWordCount: 3000,
        temperature: 0.7,
        maxTokens: 2048,
        maxCharacterCount: 5,
        characterCreativity: 0.6,
        contextChapters: 3,
      });
    }

    // Populate Novels
    const novelCount = await tx.table('novels').count();
    if (novelCount === 0) {
      await tx.table('novels').bulkAdd([
        {
          name: '无限代码',
          genre: '科幻',
          style: '赛博朋克',
          wordCount: 125000,
          chapterCount: 42,
          characterCount: 5,
          totalChapterGoal: 100,
          specialRequirements: '主角需要有一个忠诚的机器人伙伴，并且故事结尾要有一个反转。',
          createdAt: new Date('2024-07-20T10:00:00Z'),
          updatedAt: new Date(new Date().getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
        {
          name: '长安数字魅影',
          genre: '历史',
          style: '悬疑',
          wordCount: 88000,
          chapterCount: 35,
          characterCount: 8,
          totalChapterGoal: 50,
          createdAt: new Date('2024-07-18T14:30:00Z'),
          updatedAt: new Date(new Date().getTime() - 80 * 60 * 60 * 1000), // 80 hours ago
        },
        {
          name: '东海人鱼传说',
          genre: '奇幻',
          style: '浪漫',
          wordCount: 210000,
          chapterCount: 60,
          characterCount: 3,
          totalChapterGoal: 60,
          createdAt: new Date('2023-01-15T09:00:00Z'),
          updatedAt: new Date('2024-05-10T18:00:00Z'),
        },
      ]);
    }
  }
}

export const db = new InfiniteNovelDatabase();