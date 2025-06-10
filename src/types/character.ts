/**
 * 小说人物的数据模型
 */
export interface Character {
  /** 数据库自动生成的唯一ID */
  id?: number;
  /** 所属小说的ID */
  novelId: number;
  /** 人物名称 */
  name: string;
  /** 人物核心设定（一句话描述） */
  coreSetting: string;
  /** 人物性格 */
  personality: string;
  /** 人物背景故事 */
  backgroundStory: string;
  /** 人物外貌描述 */
  appearance: string;
  /** 人物头像的URL（可选） */
  avatar?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
} 