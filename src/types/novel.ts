/**
 * 小说的核心数据模型
 */
export interface Novel {
  /** 数据库自动生成的唯一ID */
  id?: number;
  /** 小说名称 */
  name: string;
  /** 题材类型，例如：科幻、历史 */
  genre: string;
  /** 写作风格，例如：赛博朋克、悬疑 */
  style: string;
  /** 小说总字数 */
  wordCount: number;
  /** 已完成的章节数量 */
  chapterCount: number;
  /** 小说中的人物数量 */
  characterCount: number;
  /** 计划完成的总章节数 */
  totalChapterGoal: number;
  /** 扩写次数 */
  expansionCount: number;
  /** 用户的特殊要求或备注 */
  specialRequirements?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
} 