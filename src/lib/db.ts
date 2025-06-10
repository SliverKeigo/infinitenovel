import { Dexie, type Table, type Transaction } from 'dexie';
import type { Novel } from '@/types/novel';
import type { AIConfig } from '@/types/ai-config';
import type { GenerationSettings } from '@/types/generation-settings';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';

// 注意：SettingsProfile 不是 stores 中使用的类型，而似乎是一个数据库概念。
// 如果它是其他类型的混合体，可以在这里定义。
// 根据之前的逻辑，它似乎是 GenerationSettings 的扩展。
export interface SettingsProfile extends GenerationSettings {
  name: string;
}

/**
 * 应用程序的 Dexie (IndexedDB) 数据库实例。
 * 负责管理所有本地存储的表。
 */
export class InfiniteNovelDatabase extends Dexie {
  /** AI 配置表 */
  aiConfigs!: Table<AIConfig>;
  /** 生成设置表，主键是数字 */
  generationSettings!: Table<GenerationSettings, number>;
  /** 小说信息表 */
  novels!: Table<Novel>;
  /** 章节内容表 */
  chapters!: Table<Chapter>;
  /** 人物角色表 */
  characters!: Table<Character>;
  /** 情节线索表 */
  plotClues!: Table<PlotClue>;
  
  // 注意：'settingsProfiles' 表似乎是多余的，如果它只是命名的 GenerationSettings。
  // generation-settings.ts store 中的逻辑直接使用预设和单个设置对象。
  // 我将暂时省略 'settingsProfiles' 以与现有的 store 逻辑保持一致。
  // 如果命名配置文件是一个单独的功能，我们可以再把它加回来。

  constructor() {
    super('InfiniteNovelDatabase');

    // 我们将所有 schema 定义合并到单个最终版本中，
    // 以简化操作并避免复杂的升级功能。
    this.version(1).stores({
      aiConfigs: '++id, &name',
      generationSettings: 'id', // ID 始终为 1
      novels: '++id, name, genre, style, createdAt, updatedAt, totalChapterGoal, specialRequirements, expansionCount',
    });
    
    this.version(2).stores({
      aiConfigs: '++id, &name',
      generationSettings: 'id', // ID 始终为 1
      novels: '++id, name, genre, style, createdAt, updatedAt, totalChapterGoal, specialRequirements, expansionCount',
      chapters: '++id, novelId, chapterNumber',
      characters: '++id, novelId',
      plotClues: '++id, novelId',
    });

    this.version(3).upgrade(async (tx) => {
      await tx.table('novels').toCollection().modify((novel) => {
        if (novel.expansionCount === undefined) {
          novel.expansionCount = 0;
        }
      });
    });

    this.on('populate', this.populate);
  }

  /**
   * 数据库初始化时填充默认数据。
   * @param tx 数据库事务对象
   */
  private async populate(tx: Transaction) {
    // 填充 AI 配置
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

    // 使用默认值填充生成设置
    const genSettingsCount = await tx.table('generationSettings').count();
    if (genSettingsCount === 0) {
      await tx.table('generationSettings').add({
        id: 1, // ID 始终为 1
        chapterWordCount: 3000,
        temperature: 0.7,
        maxTokens: 2048,
        maxCharacterCount: 5,
        characterCreativity: 0.6,
        contextChapters: 3,
      });
    }

    // 填充示例小说
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
          expansionCount: 0,
          specialRequirements: '主角需要有一个忠诚的机器人伙伴，并且故事结尾要有一个反转。',
          createdAt: new Date('2024-07-20T10:00:00Z'),
          updatedAt: new Date(new Date().getTime() - 2 * 60 * 60 * 1000), // 2 小时前
        },
        {
          name: '长安数字魅影',
          genre: '历史',
          style: '悬疑',
          wordCount: 88000,
          chapterCount: 35,
          characterCount: 8,
          totalChapterGoal: 50,
          expansionCount: 2,
          createdAt: new Date('2024-07-18T14:30:00Z'),
          updatedAt: new Date(new Date().getTime() - 80 * 60 * 60 * 1000), // 80 小时前
        },
        {
          name: '东海人鱼传说',
          genre: '奇幻',
          style: '浪漫',
          wordCount: 210000,
          chapterCount: 60,
          characterCount: 3,
          totalChapterGoal: 60,
          expansionCount: 5,
          createdAt: new Date('2023-01-15T09:00:00Z'),
          updatedAt: new Date('2024-05-10T18:00:00Z'),
        },
      ]);
    }
  }
}

export const db = new InfiniteNovelDatabase();