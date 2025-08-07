import type {
  Novel as PrismaNovel,
  NovelChapter as PrismaNovelChapter,
  NovelRole as PrismaNovelRole,
  NovelScene as PrismaNovelScene,
  NovelClue as PrismaNovelClue,
} from "@prisma/client";

export type NovelChapter = PrismaNovelChapter;
export type NovelRole = PrismaNovelRole;
export type NovelScene = PrismaNovelScene;
export type NovelClue = PrismaNovelClue;

export type Novel = PrismaNovel & {
  chapters: NovelChapter[];
  roles: NovelRole[];
  scenes: NovelScene[];
  clues: NovelClue[];
};
