// 风格指导条目解析与正文生成指令拼接工具

export interface StyleGuideEntry {
  id: string;
  type: string;
  description: string;
  trigger?: string;
}

// 条目类型-正文生成指令模板映射表
const TYPE_TO_DIRECTIVE: Record<string, string> = {
  'hook': '每个场景结尾必须有强烈钩子/悬念/反转，激发读者继续阅读。',
  'scene_end': '每个场景结尾必须有强烈钩子/悬念/反转。',
  '爽点': '每场景需有至少一个爽点/反转/系统奖励/主角内心独白。',
  'scene_core': '每场景需有爽点、反转或系统奖励。',
  '系统消息': '如为系统流，适当插入系统提示、属性面板、升级反馈等内容。',
  // 可扩展更多类型
};

// 关键词到类型的简单映射（用于自然语言fallback）
const KEYWORD_TO_TYPE: Record<string, string> = {
  '钩子': 'hook',
  '悬念': 'hook',
  '爽点': '爽点',
  '系统提示': '系统消息',
  '属性面板': '系统消息',
  '升级反馈': '系统消息',
};

/**
 * 解析风格指导字符串为结构化条目数组，兼容JSON和自然语言
 */
export function parseStyleGuideEntries(styleGuide: string): StyleGuideEntry[] {
  // 1. 结构化JSON
  try {
    const parsed = JSON.parse(styleGuide);
    if (Array.isArray(parsed) && parsed[0]?.description) {
      return parsed as StyleGuideEntry[];
    }
  } catch {}
  // 2. 自然语言fallback：按行分割，关键词提取
  const lines = styleGuide.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
  const entries: StyleGuideEntry[] = [];
  for (const line of lines) {
    for (const [kw, type] of Object.entries(KEYWORD_TO_TYPE)) {
      if (line.includes(kw)) {
        entries.push({
          id: type,
          type,
          description: line,
        });
        break;
      }
    }
  }
  return entries;
}

/**
 * 根据风格指导条目，动态生成正文生成指令（如钩子、爽点等）
 */
export function getDynamicSceneDirectives(entries: StyleGuideEntry[]): string {
  if (!entries.length) return '';
  const usedTypes = new Set<string>();
  const directives: string[] = [];
  for (const entry of entries) {
    const type = entry.type;
    if (TYPE_TO_DIRECTIVE[type] && !usedTypes.has(type)) {
      directives.push(TYPE_TO_DIRECTIVE[type]);
      usedTypes.add(type);
    }
  }
  if (!directives.length) return '';
  return `\n### 网络小说特色硬性要求\n- ${directives.join('\n- ')}`;
} 