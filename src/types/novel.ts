export interface Novel {
  id?: number;
  name: string;
  genre: string;
  style: string;
  wordCount: number;
  chapterCount: number;
  characterCount: number;
  totalChapterGoal: number;
  specialRequirements?: string;
  createdAt: Date;
  updatedAt: Date;
} 