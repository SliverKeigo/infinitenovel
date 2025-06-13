import { Dexie, type Table, type Transaction } from 'dexie';
import type { Novel } from '@/types/novel';
import type { AIConfig } from '@/types/ai-config';
import type { GenerationSettings } from '@/types/generation-settings';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';
import type { SerializedVectorIndex } from '@/types/vector-index';

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
export class InfiniteNovelDB extends Dexie {
  novels!: Table<Novel>;
  chapters!: Table<Chapter>;
  characters!: Table<Character>;
  plotClues!: Table<PlotClue>;
  aiConfigs!: Table<AIConfig>;
  generationSettings!: Table<GenerationSettings>;
  novelVectorIndexes!: Table<SerializedVectorIndex>;

  constructor() {
    super('InfiniteNovelDB_v2');
    this.version(1).stores({
      novels: '++id, &name, genre, style, totalChapterGoal, wordCount, chapterCount, characterCount, plotClueCount, expansionCount, createdAt, updatedAt',
      chapters: '++id, novelId, chapterNumber, title, status, wordCount, createdAt, updatedAt',
      characters: '++id, novelId, name, status, createdAt, updatedAt',
      plotClues: '++id, novelId, title, createdAt, updatedAt',
      aiConfigs: '++id, &name',
      generationSettings: '++id',
      novelVectorIndexes: '++id, novelId, indexDump'
    });
    this.version(2).stores({
      novels: '++id, &name, genre, style, totalChapterGoal, wordCount, chapterCount, characterCount, plotClueCount, expansionCount, createdAt, updatedAt, specialRequirements',
      chapters: '++id, novelId, chapterNumber, title, content, status, wordCount, summary, createdAt, updatedAt',
      characters: '++id, novelId, name, coreSetting, personality, backgroundStory, isProtagonist, biography, relationships, status, createdAt, updatedAt',
      plotClues: '++id, novelId, title, description, createdAt, updatedAt',
    }).upgrade(tx => {
       // 该升级是可选的，主要是为了确保旧数据有新字段的默认值
      return tx.table('novels').toCollection().modify(novel => {
        if (novel.specialRequirements === undefined) {
          novel.specialRequirements = '';
        }
      });
    });
    this.version(3).stores({}).upgrade(tx => {
      return tx.table('novels').toCollection().modify(novel => {
        if (novel.expansionCount === undefined) {
          novel.expansionCount = 0;
        }
      });
    });
    this.version(4).stores({
        novels: '++id, &name, genre, style, totalChapterGoal, wordCount, chapterCount, characterCount, plotClueCount, expansionCount, createdAt, updatedAt, specialRequirements, storyConstitution',
    }).upgrade(tx => {
        return tx.table('novels').toCollection().modify(novel => {
            if (novel.storyConstitution === undefined) {
                novel.storyConstitution = '';
            }
        });
    });
    this.version(5).stores({}).upgrade(tx => {
      // 更新AI配置表，添加向量化模型相关字段
      return tx.table('aiConfigs').toCollection().modify(config => {
        if (config.useApiForEmbeddings === undefined) {
          config.useApiForEmbeddings = false;
        }
        if (config.embeddingModel === undefined) {
          // 默认使用OpenAI的文本嵌入模型
          config.embeddingModel = config.useApiForEmbeddings ? 
            'text-embedding-ada-002' : 
            'Xenova/all-MiniLM-L6-v2';
        }
      });
    });
    this.version(6).stores({}).upgrade(tx => {
      // 更新AI配置表，添加独立嵌入配置相关字段
      return tx.table('aiConfigs').toCollection().modify(config => {
        if (config.useIndependentEmbeddingConfig === undefined) {
          config.useIndependentEmbeddingConfig = false;
        }
        if (config.embeddingApiKey === undefined) {
          config.embeddingApiKey = '';
        }
        if (config.embeddingApiBaseUrl === undefined) {
          config.embeddingApiBaseUrl = '';
        }
      });
    });
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
        useApiForEmbeddings: false,
        embeddingModel: 'Xenova/all-MiniLM-L6-v2',
        useIndependentEmbeddingConfig: false,
        embeddingApiKey: '',
        embeddingApiBaseUrl: '',
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
      ]);
    }
  }
}

export const db = new InfiniteNovelDB();