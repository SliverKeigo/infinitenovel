import { create } from 'zustand';
import { db } from '@/lib/db';
import type { Novel } from '@/types/novel';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';

interface NovelState {
  novels: Novel[];
  loading: boolean;
  currentNovel: Novel | null;
  chapters: Chapter[];
  characters: Character[];
  plotClues: PlotClue[];
  detailsLoading: boolean;
  fetchNovels: () => Promise<void>;
  fetchNovelDetails: (id: number) => Promise<void>;
  addNovel: (novel: Omit<Novel, 'id' | 'createdAt' | 'updatedAt' | 'wordCount' | 'chapterCount' | 'characterCount' | 'expansionCount'>) => Promise<void>;
  deleteNovel: (id: number) => Promise<void>;
}

export const useNovelStore = create<NovelState>((set, get) => ({
  novels: [],
  loading: true,
  currentNovel: null,
  chapters: [],
  characters: [],
  plotClues: [],
  detailsLoading: true,
  fetchNovels: async () => {
    set({ loading: true });
    const novels = await db.novels.orderBy('updatedAt').reverse().toArray();
    set({ novels, loading: false });
  },
  fetchNovelDetails: async (id) => {
    set({ detailsLoading: true, currentNovel: null, chapters: [], characters: [], plotClues: [] });
    try {
      const novel = await db.novels.get(id);
      if (!novel) throw new Error('Novel not found');

      const chapters = await db.chapters.where('novelId').equals(id).sortBy('chapterNumber');
      const characters = await db.characters.where('novelId').equals(id).toArray();
      const plotClues = await db.plotClues.where('novelId').equals(id).toArray();

      set({
        currentNovel: novel,
        chapters,
        characters,
        plotClues,
        detailsLoading: false,
      });
    } catch (error) {
      console.error("Failed to fetch novel details:", error);
      set({ detailsLoading: false });
    }
  },
  addNovel: async (novelData) => {
    const newNovel: Omit<Novel, 'id'> = {
      ...novelData,
      wordCount: 0,
      chapterCount: 0,
      characterCount: 0,
      expansionCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      specialRequirements: novelData.specialRequirements || '',
    };
    await db.novels.add(newNovel as Novel);
    // 无需重新获取，直接添加到状态以实现即时UI更新
    // 但重新获取更简单，并能确保在有其他客户端存在时的数据一致性。
    await get().fetchNovels();
  },
  deleteNovel: async (id) => {
    await db.novels.delete(id);
    set((state) => ({
      novels: state.novels.filter((novel) => novel.id !== id),
    }));
  },
})); 