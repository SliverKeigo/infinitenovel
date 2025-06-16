/**
 * 用于索引的文档类型定义
 */
export interface DocumentToIndex {
  id: string;
  content: string;
  metadata?: {
    [key: string]: any;
  };
} 