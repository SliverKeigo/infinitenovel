import Dexie, { type Table } from 'dexie';
import { AIConfig } from '@/types/ai-config';
import { GenerationSettings } from '@/types/generation-settings';

class InfiniteNovelDB extends Dexie {
  aiConfigs!: Table<AIConfig>;
  generationSettings!: Table<GenerationSettings, 1>; // Note: The 1 means the key is of type number

  constructor() {
    super('InfiniteNovelDB');
    this.version(1).stores({
      aiConfigs: '++id, name', // ++id is auto-incrementing primary key, name is an index
    });
    this.version(2).stores({
      aiConfigs: '++id, name',
      generationSettings: 'id', // Primary key is 'id', not auto-incrementing
    });
  }
}

export const db = new InfiniteNovelDB(); 