/**
 * 情节线索的数据模型
 */
export interface PlotClue {
  /** 数据库自动生成的唯一ID */
  id?: number;
  /** 所属小说的ID */
  novelId: number;
  /** 线索标题或摘要 */
  title: string;
  /** 线索的详细描述 */
  description: string;
  /** 与此线索相关的章节ID列表（可选） */
  relatedChapterIds?: number[];
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
  /** 首次提及的章节ID（可选） */
  firstMentionedInChapter?: number;
} 