/**
 * 小说生成和管理的常量定义
 */

export const INITIAL_CHAPTER_GENERATION_COUNT = 5;
export const OUTLINE_EXPAND_THRESHOLD = 3; // 当细纲剩余少于3章时触发扩展
export const OUTLINE_EXPAND_CHUNK_SIZE = 7; // 每次扩展7章的细纲

// 大纲格式相关常量
export const OUTLINE_CHAPTER_WORD_LIMIT = 100; // 每个章节大纲的最大字数
export const OUTLINE_CHAPTER_MAX_EVENTS = 2; // 每个章节大纲中的最大事件数量

// 章节内容生成相关常量
export const CHAPTER_WORD_TARGET = 4000; // 每章的目标字数
export const CHAPTER_WORD_TOLERANCE = 0.15; // 允许的字数浮动范围（15%） 