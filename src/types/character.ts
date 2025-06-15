/**
 * 小说人物的数据模型
 */
export interface Character {
  /** 数据库自动生成的唯一ID */
  id?: number;
  /** 所属小说的ID */
  novel_id: number;
  /** 人物名称 */
  name: string;
  /** 人物核心设定（一句话描述） */
  core_setting: string;
  /** 人物性格 */
  personality: string;
  /** 人物背景故事 */
  background_story: string;
  /** 人物外貌描述 */
  appearance: string;
  /** 人物头像的URL（可选） */
  avatar?: string;
  /** 创建时间 */
  created_at: Date;
  /** 最后更新时间 */
  updated_at: Date;
  /** 人物描述 */
  description: string;
  /** 人物背景 */
  background: string;
  /** 首次出现章节（可选） */
  first_appeared_in_chapter?: number;
  /** 是否是主角 */
  is_protagonist?: boolean;
  /** 状态 */
  status?: string;
  /** 关系 */
  relationships?: string;
}

/**
 * 用于批量创建角色的数据结构，只包含前端需要发送的字段。
 */
export type CharacterCreationData = Omit<Character, 'id' | 'novel_id' | 'created_at' | 'updated_at' | 'background'>; 