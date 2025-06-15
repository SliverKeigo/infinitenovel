/**
 * 章节的数据模型
 */
export interface Chapter {
  /** 数据库自动生成的唯一ID */
  id?: number;
  /** 所属小说的ID */
  novel_id: number;
  /** 章节序号 */
  chapter_number: number;
  /** 章节标题 */
  title: string;
  /** 章节正文内容 */
  content: string;
  /**
   * 章节摘要（可选），可由AI生成或手动填写，用于快速回顾和RAG检索。
   */
  summary?: string;
  /** 章节字数 */
  word_count: number;
  /** 章节状态 ('draft': 草稿, 'published': 已发布) */
  status: 'draft' | 'published';
  /** 创建时间 */
  created_at: Date;
  /** 最后更新时间 */
  updated_at: Date;
} 