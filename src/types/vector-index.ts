/**
 * 表示存储在 Dexie 中的序列化向量索引的结构。
 */
export interface SerializedVectorIndex {
  /**
   * 对应于 `novels` 表中的小说 ID。
   */
  novel_id: number;
  /**
   * Voy-search 索引的序列化（JSON 字符串）表示。
   */
  index_dump: string;
} 