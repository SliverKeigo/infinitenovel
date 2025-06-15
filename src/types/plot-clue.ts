/**
 * 情节线索的数据模型
 */
export interface PlotClue {
  /** 数据库自动生成的唯一ID */
  id?: number;
  /** 所属小说的ID */
  novel_id: number;
  /** 线索标题或摘要 */
  title: string;
  /** 线索的详细描述 */
  description: string;
  /** 与此线索相关的章节ID列表（可选） */
  related_chapter_ids?: number[];
  /** 创建时间 */
  created_at: Date;
  /** 最后更新时间 */
  updated_at: Date;
  /** 首次提及的章节ID（可选） */
  first_mentioned_in_chapter?: number;
} 