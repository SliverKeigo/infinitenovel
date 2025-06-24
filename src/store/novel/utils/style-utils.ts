// 风格指导条目解析与正文生成指令拼接工具
import { extractTextFromAIResponse } from "./ai-utils";

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


export function processAIStyleResponse(response: string) {
  // 假设 extractTextFromAIResponse 返回的是包含自然语言和代码块的完整字符串
  const styleGuideText = extractTextFromAIResponse(response);

  // 默认的 fallback 值是原始文本
  let styleGuideToSave = styleGuideText;
  let jsonString = null;

  // --- 健壮性增强部分 ---

  // 1. 优先尝试从 ```json ... ``` 代码块中提取JSON
  //    这个正则表达式会查找被 ```json 和 ``` 包围的内容
  //    ([\s\S]*?) 是一个非贪婪匹配，用于捕获两者之间的所有字符（包括换行符）
  const codeBlockMatch = styleGuideText.match(/```json\s*([\s\S]*?)\s*```/);

  if (codeBlockMatch && codeBlockMatch[1]) {
      // 如果匹配成功，捕获组1就是纯净的JSON字符串
      jsonString = codeBlockMatch[1].trim();
  } else {
      // 2. 如果没有找到代码块，作为备用方案，尝试查找第一个 '[' 或 '{'
      //    到最后一个 ']' 或 '}' 的内容。这能处理AI直接返回无包裹的JSON的情况。
      const firstBracket = styleGuideText.indexOf('[');
      const firstBrace = styleGuideText.indexOf('{');
      
      // 找到JSON的起始位置
      let startIndex = -1;
      if (firstBracket > -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
          startIndex = firstBracket;
      } else if (firstBrace > -1) {
          startIndex = firstBrace;
      }

      if (startIndex > -1) {
          const lastBracket = styleGuideText.lastIndexOf(']');
          const lastBrace = styleGuideText.lastIndexOf('}');
          const endIndex = Math.max(lastBracket, lastBrace);

          if (endIndex > startIndex) {
              // 提取出可能的JSON字符串
              jsonString = styleGuideText.substring(startIndex, endIndex + 1);
          }
      }
  }

  // 3. 如果成功提取出JSON字符串，则尝试解析和格式化
  if (jsonString) {
      try {
          const parsed = JSON.parse(jsonString);
          // 这里可以加上更严格的验证，确保解析出的对象是我们期望的结构
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].description) {
              // 验证通过，将其格式化为美观的JSON字符串进行存储
              styleGuideToSave = JSON.stringify(parsed, null, 2);
          }
          // 注意：如果解析成功但结构不符，程序会继续使用默认的 styleGuideToSave（原始文本）
          // 如果希望在这种情况下也报错或有不同处理，可以在此添加 else 逻辑
      } catch (e) {
          // 解析失败，说明提取的字符串不是有效的JSON。
          // 这种情况我们什么都不做，保持 styleGuideToSave 为原始文本，并可以在控制台打印错误方便调试。
          console.error("提取出的字符串无法解析为JSON:", e);
          console.error("提取内容:", jsonString);
      }
  }

  // 返回最终要保存的内容
  return styleGuideToSave;
}