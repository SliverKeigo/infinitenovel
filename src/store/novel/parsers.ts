/**
 * 解析相关的工具函数
 */

import { parse as parseDirtyJson } from 'dirty-json';

// 标准化用于分割宏观叙事规划的正则表达式，以确保所有函数使用统一、健壮的逻辑
const MACRO_PLANNING_SEPARATOR_REGEX = /\s*(?:---)?\s*(?:\*\*)?\s*宏观叙事规划\s*(?:\*\*)?\s*(?:---)?\s*/i;

/**
 * 净化包含非法换行符的JSON字符串。
 * 它通过一个巧妙的方法来修复问题：
 * 1. 保护合法的、用于格式化的换行符（那些在引号之外的）。
 * 2. 将非法的、在字符串值内部的换行符替换为合法的'\\n'。
 * @param jsonString - 可能包含错误的JSON字符串
 * @returns 净化后的JSON字符串
 */
const sanitizeJsonString = (jsonString: string): string => {
  let sanitized = '';
  let inString = false;
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];
    const prevChar = i > 0 ? jsonString[i - 1] : null;

    // 当遇到一个非转义的双引号时，切换 inString 状态
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
    }

    if (inString && char === '"' && prevChar !== '\\') {
      // 这是字符串的起始引号，直接添加
      sanitized += char;
    } else if (inString) {
      // 在字符串内部
      if (char === '"') {
        sanitized += '\\"'; // 修复非法的内部双引号
      } else if (char === '\n') {
        sanitized += '\\n'; // 修复非法的内部换行符
      } else if (char === '\r') {
        // 忽略 \r
      } else {
        sanitized += char;
      }
    } else {
      // 不在字符串内部，直接添加
      sanitized += char;
    }
  }
  return sanitized;
};

/**
 * 从AI返回的可能包含Markdown代码块的字符串中安全地解析JSON。
 * @param content - AI返回的原始字符串
 * @returns 解析后的JavaScript对象
 * @throws 如果找不到或无法解析JSON，则抛出错误
 */
export const parseJsonFromAiResponse = (content: string): any => {
  if (!content) {
    throw new Error('无法解析空内容');
  }

  // 移除 <think> 标签（如果存在）
  let cleanContent = content;
  const thinkEnd = cleanContent.lastIndexOf('</think>');
  if (thinkEnd !== -1) {
    cleanContent = cleanContent.substring(thinkEnd + 8).trim();
  }

  // 生成一个候选字符串列表，按可能性从高到低排序
  const candidates: string[] = [];

  // 候选1: 原始（清理后）内容
  candidates.push(cleanContent);

  // 候选2: 第一个Markdown代码块内的内容
  const codeBlockMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch?.[1]) {
    candidates.push(codeBlockMatch[1]);
  }

  // 候选3: 第一个 '{' 和最后一个 '}' 之间的内容
  const firstBrace = cleanContent.indexOf('{');
  const lastBrace = cleanContent.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleanContent.substring(firstBrace, lastBrace + 1));
  }

  // 使用 Set 去除重复的候选字符串
  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    if (!candidate) continue;

    try {
      // 步骤 0: 净化字符串，修复非法换行符
      const sanitizedCandidate = sanitizeJsonString(candidate);

      // 步骤 A: 尝试使用标准的、严格的解析器
      let parsed = JSON.parse(sanitizedCandidate);

      // 步骤 B: 如果解析结果是字符串，则尝试二次解析（处理双重编码的JSON）
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }

      // 确认最终得到的是一个对象
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed; // 成功，返回结果
      }
    } catch (e) {
      // 步骤 C: 如果标准解析失败，则回退到使用宽容的 dirty-json 解析器
      try {
        // 同样对候选字符串进行净化
        const parsed = parseDirtyJson(sanitizeJsonString(candidate));
        // 不对 dirty-json 的结果进行二次解析，因为它本身的行为可能不稳定
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed; // 成功，返回结果
        }
      } catch (dirtyError) {
        // dirty-json 也失败了，继续尝试下一个候选字符串
        continue;
      }
    }
  }

  // 如果所有候选字符串和所有方法都失败了，则抛出错误
  throw new Error('AI返回了无效的JSON格式，无法解析');
};

/**
 * 清理AI生成的大纲内容，移除前缀说明文字和格式化内容。
 * @param content - AI返回的原始大纲内容
 * @returns 清理后的大纲内容，只包含章节详情和宏观规划
 */
export const processOutline = (content: string): string => {
  if (!content) return '';

  // 从原始内容开始，移除之前错误的、会删除宏观规划的清理步骤
  let cleanedContent = content;

  // 标准化章节标记格式
  // 将各种格式的章节标记统一为"第X章: "格式
  cleanedContent = cleanedContent.replace(/第\s*(\d+)\s*\.?\s*章[:\：]?\s*/gi, (match, chapterNum) => {
    return `第${chapterNum}章: `;
  });


  // 确保宏观叙事规划/逐章细纲部分格式正确
  const newSeparatorRegex = /\n---\s*\*\*逐章细纲\*\*\s*---\n/i;

  if (newSeparatorRegex.test(cleanedContent)) {
    // 新格式: 宏观规划在前
    const parts = cleanedContent.split(newSeparatorRegex);
    if (parts.length >= 2) {
      const macro = parts[0].trim();
      const detailed = parts[1].trim();
      // 标准化为新格式
      cleanedContent = `${macro}\n\n---\n**逐章细纲**\n---\n\n${detailed}`;
    }
  } else if (cleanedContent.includes('宏观叙事规划')) {
    // 旧格式回退: 详细大纲在前
    const parts = cleanedContent.split(MACRO_PLANNING_SEPARATOR_REGEX);
    if (parts.length >= 2) {
      const chapterDetail = parts[0].trim();
      const macroPlanning = parts[1].trim();
      // 标准化为旧格式
      cleanedContent = `${chapterDetail}\n\n---\n**宏观叙事规划**\n---\n${macroPlanning}`;
    }
  }

  return cleanedContent.trim();
};

/**
 * 表示宏观叙事阶段的接口
 */
export interface NarrativeStage {
  stageName: string;      // 阶段名称，如"第一幕"
  chapterRange: {         // 章节范围
    start: number;        // 起始章节号
    end: number;          // 结束章节号
  };
  coreSummary: string;    // 核心概述
  keyElements: string[];  // 关键元素（可选）
}

/**
 * 从大纲中提取宏观叙事规划信息
 * @param content - 完整的大纲内容
 * @returns 宏观叙事规划的各个阶段
 */
export const extractNarrativeStages = (content: string): NarrativeStage[] => {
  // 将内容按详细章节大纲的分隔符分割
  const parts = content.split(/---\s*\*\*逐章细纲\*\*\s*---/);
  // 如果没有分隔符，直接使用整个内容
  const macroPlanningPart = parts.length > 1 ? parts[0].trim() : content.trim();

  const stages: NarrativeStage[] = [];
  // 存储所有匹配到的范围位置
  const ranges: { start: number; end: number; match: string; index: number }[] = [];

  // 先找到所有的章节范围
  const regex = /(\d+)\s*-\s*(\d+)/g;
  let match;

  while ((match = regex.exec(macroPlanningPart)) !== null) {
    ranges.push({
      start: parseInt(match[1], 10),
      end: parseInt(match[2], 10),
      match: match[0],
      index: match.index
    });
  }

  // 处理每一个范围
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    let coreSummary = '';

    // 提取当前范围到下一个范围之间的内容作为 coreSummary
    if (i < ranges.length - 1) {
      // 从当前范围结束到下一个范围开始
      const nextRange = ranges[i + 1];
      const summaryStart = range.index + range.match.length;
      const summaryEnd = nextRange.index;
      coreSummary = macroPlanningPart.slice(summaryStart, summaryEnd).trim();
    } else {
      // 最后一个范围，提取到文本末尾
      const summaryStart = range.index + range.match.length;
      coreSummary = macroPlanningPart.slice(summaryStart).trim();
    }

    stages.push({
      stageName: `第${i + 1}幕`,
      chapterRange: {
        start: range.start,
        end: range.end
      },
      coreSummary,
      keyElements: []
    });
  }

  return stages;
};

/**
 * 根据章节号确定当前所处的叙事阶段
 * @param stages - 宏观叙事规划的各个阶段
 * @param chapterNumber - 当前章节号
 * @returns 当前所处的叙事阶段，如果找不到则返回null
 */
export const getCurrentNarrativeStage = (stages: NarrativeStage[], chapterNumber: number): NarrativeStage | null => {
  if (!stages || stages.length === 0) return null;

  for (const stage of stages) {
    if (chapterNumber >= stage.chapterRange.start && chapterNumber <= stage.chapterRange.end) {
      return stage;
    }
  }

  // 如果找不到匹配的阶段，返回最接近的一个
  const lastStage = stages[stages.length - 1];
  const firstStage = stages[0];

  if (chapterNumber > lastStage.chapterRange.end) {
    return lastStage;
  }

  if (chapterNumber < firstStage.chapterRange.start) {
    return firstStage;
  }

  return null;
};

/**
 * 提取详细大纲和宏观规划
 * @param outline - 完整的大纲内容
 * @returns 包含详细大纲和宏观规划的对象
 */
export const extractDetailedAndMacro = (outline: string): { detailed: string, macro: string } => {
  // 新的分隔符，用于切分宏观规划和详细章节大纲
  const separatorRegex = /\n---\s*\*\*逐章细纲\*\*\s*---\n/i;
  const parts = outline.split(separatorRegex);

  if (parts.length >= 2) {
    // 新格式：宏观规划在前 (parts[0])，详细大纲在后 (parts[1])
    return {
      macro: parts[0].trim(),
      detailed: parts[1].trim()
    };
  } else {
    const oldSeparatorRegex = /\n---\s*\*\*宏观叙事规划\*\*\s*---\n/i;
    const oldParts = outline.split(oldSeparatorRegex);
    if (oldParts.length >= 2) {
      // 旧格式：详细大纲在前 (oldParts[0])，宏观规划在后 (oldParts[1])
      return {
        detailed: oldParts[0].trim(),
        macro: oldParts[1].trim()
      };
    }

    // 如果两种分隔符都找不到，则假定整个大纲都是详细大纲
    return {
      detailed: outline.trim(),
      macro: ''
    };
  }
}; 