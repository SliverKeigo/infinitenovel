/**
 * 解析相关的工具函数
 */

import { parse as parseDirtyJson } from 'dirty-json';

// 标准化用于分割宏观叙事规划的正则表达式，以确保所有函数使用统一、健壮的逻辑
const MACRO_PLANNING_SEPARATOR_REGEX = /\s*(?:---)?\s*(?:\*\*)?\s*宏观叙事规划\s*(?:\*\*)?\s*(?:---)?\s*/i;

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
  const thinkEnd = content.lastIndexOf('</think>');
  if (thinkEnd !== -1) {
    content = content.substring(thinkEnd + 8).trim();
  }

  const tryParse = (str: string): any | null => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };

  // 1) 直接解析
  let result = tryParse(content);
  if (result !== null) return result;

  // 2) 提取首个 Markdown 代码块再解析
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    result = tryParse(codeBlockMatch[1]);
    if (result !== null) return result;
  }

  // 3) 截取第一个 { 到最后一个 }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const slice = content.substring(firstBrace, lastBrace + 1);
    result = tryParse(slice);
    if (result !== null) return result;
  }

  // 4) 使用 dirty-json 宽容解析（依次尝试原文 → 代码块 → slice）
  const dirtyTry = (str: string): any | null => {
    try {
      return parseDirtyJson(str);
    } catch {
      return null;
    }
  };

  result = dirtyTry(content);
  if (result !== null) return result;
  if (codeBlockMatch && (result = dirtyTry(codeBlockMatch[1])) !== null) return result;
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    result = dirtyTry(content.substring(firstBrace, lastBrace + 1));
    if (result !== null) return result;
  }

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
  
  console.log('[大纲处理] 章节标记标准化完成');
  
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
  console.log("[宏观规划提取] 开始匹配宏观叙事阶段");
  
  // 将内容按详细章节大纲的分隔符分割
  const parts = content.split(/---\s*\*\*逐章细纲\*\*\s*---/);
  const macroPlanningPart = parts[0].trim();
  
  console.log("[宏观规划提取] 宏观规划部分内容:", macroPlanningPart);
  
  const stages: NarrativeStage[] = [];
  // 修改正则表达式以更好地匹配大纲格式，支持全角和半角字符
  const regex = /\*\*(第[一二三四五六七八九十]+幕)\s*[:：]\s*(.*?)\s*[（\(]大约章节范围\s*[:：]\s*(\d+)\s*-\s*(\d+)\s*[）\)]\*\*/gm;
  let match;

  while ((match = regex.exec(macroPlanningPart)) !== null) {
    console.log("[宏观规划提取] 匹配到标题:", match[0]);
    
    const stageName = match[1].trim();
    const stageTitle = match[2].trim(); // 完整标题，包含破折号
    const startChapter = parseInt(match[3], 10);
    const endChapter = parseInt(match[4], 10);
    
    console.log(`[宏观规划提取] 解析结果 - 阶段: ${stageName}, 标题: ${stageTitle}, 章节范围: ${startChapter}-${endChapter}`);
    
    // 提取该阶段的核心概述
    const stageStart = match.index! + match[0].length;
    let stageEnd = macroPlanningPart.length;
    
    // 寻找下一个阶段的开始位置
    const nextMatch = macroPlanningPart.slice(stageStart).match(/^\s*\*\*第[一二三四五六七八九十]+幕/m);
    if (nextMatch) {
      stageEnd = stageStart + nextMatch.index!;
    }
   
    // 提取阶段内容
    let stageContent = macroPlanningPart.substring(stageStart, stageEnd).trim();
    
    // 整个阶段内容就是核心概述
    // 移除开头的-、*、空格等列表标记
    const coreSummary = stageContent.replace(/^[\s*\-•]+/, '').trim();
    
    console.log(`[宏观规划提取] 提取到核心概述:`, coreSummary.substring(0, 50) + "...");
    
    // 不再单独提取关键元素，因为它们已经包含在核心概述中
    const keyElements: string[] = [];
    
    stages.push({
      stageName: `${stageName}: ${stageTitle}`,
      chapterRange: {
        start: startChapter,
        end: endChapter
      },
      coreSummary,
      keyElements
    });
  }
  
  console.log(`[宏观规划提取] 成功提取 ${stages.length} 个叙事阶段`);
  if (stages.length > 0) {
    stages.forEach((stage, index) => {
      console.log(`[宏观规划提取] 阶段 ${index + 1}: ${stage.stageName} (第${stage.chapterRange.start}-${stage.chapterRange.end}章)`);
    });
  } else {
    console.log("[宏观规划] 未找到宏观叙事规划，跳过阶段指导生成");
    // 输出一些调试信息，帮助诊断为什么没有匹配到
    console.log("[宏观规划提取] 调试信息 - 正则表达式:", regex.source);
    console.log("[宏观规划提取] 调试信息 - 第一个标题行:", macroPlanningPart.split('\n')[0]);
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