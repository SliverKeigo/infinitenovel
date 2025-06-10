import { create } from 'zustand';
import { db } from '@/lib/db';
import type { Novel } from '@/types/novel';

interface NovelState {
  novels: Novel[];
  loading: boolean;
  fetchNovels: () => Promise<void>;
  addNovel: (novel: Omit<Novel, 'id' | 'createdAt' | 'updatedAt' | 'wordCount' | 'chapterCount' | 'characterCount'>) => Promise<void>;
  deleteNovel: (id: number) => Promise<void>;
}

export const useNovelStore = create<NovelState>((set, get) => ({
  novels: [],
  loading: true,
  fetchNovels: async () => {
    set({ loading: true });
    const novels = await db.novels.orderBy('updatedAt').reverse().toArray();
    set({ novels, loading: false });
  },
  addNovel: async (novelData) => {
    const newNovel: Novel = {
      ...novelData,
      id: undefined, // Let Dexie handle it
      wordCount: 0,
      chapterCount: 0,
      characterCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      specialRequirements: novelData.specialRequirements || '',
    };
    await db.novels.add(newNovel);
    // No need to refetch, just add to state for immediate UI update
    // But fetching is simpler and ensures data consistency if other clients exist.
    await get().fetchNovels();
  },
  deleteNovel: async (id) => {
    await db.novels.delete(id);
    set((state) => ({
      novels: state.novels.filter((novel) => novel.id !== id),
    }));
  },
})); 