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
  word_count: number;
  /** 已完成的章节数量 */
  chapter_count: number;
  /** 小说中的人物数量 */
  character_count: number;
  /** 计划完成的总章节数 */
  total_chapter_goal: number;
  /** 扩写次数 */
  expansion_count: number;
  /** 生成的剧情大纲 */
  plot_outline?: string;
  /** 包含的情节线索数量 */
  plot_clue_count: number;
  /** 小说简介 */
  description?: string;
  /** 用户的特殊要求或备注 */
  special_requirements?: string;
  /** AI生成的综合风格指导 */
  style_guide?: string; // 兼容自然语言或结构化JSON字符串
  /** AI生成的角色行为准则 */
  character_behavior_rules?: string;
  /** 创建时间 */
  created_at: Date;
  /** 最后更新时间 */
  updated_at: Date;
}

/**
 * 生成任务的状态定义
 */
export interface GenerationTask {
  /** 任务是否处于活动状态 */
  isActive: boolean;
  /** 任务进度（0-100） */
  progress: number;
  /** 当前步骤的描述 */
  currentStep: string;
  /** 相关小说的ID */
  novelId: number | null;
  /** 任务模式 */
  mode: 'create' | 'continue' | 'idle';
}
