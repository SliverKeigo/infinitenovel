/**
 * 解析相关的工具函数
 */

import { log } from "console";

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
    console.error("parseJsonFromAiResponse: 输入内容为空");
    throw new Error("无法解析空内容");
  }
  
  console.log("parseJsonFromAiResponse: 开始解析内容", content.substring(0, 100) + "...");
  
  // 处理<think>标签
  const thinkTagEnd = content.lastIndexOf('</think>');
  if (thinkTagEnd !== -1) {
    console.log("parseJsonFromAiResponse: 检测到<think>标签，移除标签内容");
    // 只保留</think>标签之后的内容
    content = content.substring(thinkTagEnd + 8).trim(); // 8是</think>的长度
    console.log("parseJsonFromAiResponse: 移除标签后的内容", content.substring(0, 100) + "...");
  }
  
  // 尝试直接解析
  try {
    return JSON.parse(content);
  } catch (e) {
    console.warn("parseJsonFromAiResponse: 直接JSON解析失败，尝试预处理", e);
  }

  try {
    // 提取代码块中的JSON
    let jsonString = content;
    
    // 尝试匹配Markdown代码块中的JSON
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      console.log("parseJsonFromAiResponse: 找到Markdown代码块");
      jsonString = codeBlockMatch[1];
    } else {
      // 尝试匹配直接的JSON对象（从第一个{到最后一个}）
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        console.log("parseJsonFromAiResponse: 找到JSON对象");
        jsonString = content.substring(firstBrace, lastBrace + 1);
      }
    }

    // 预处理JSON字符串
    // 1. 修复不完整的转义引号
    jsonString = jsonString.replace(/\\"/g, '"').replace(/([^\\])"/g, '$1\\"').replace(/^"/, '\\"').replace(/\\"([,\s\n])/g, '\\"$1');
    // 2. 再次修复，确保所有引号都被正确转义
    jsonString = jsonString.replace(/\\\\"/g, '\\"');
    // 3. 替换不标准的引号
    jsonString = jsonString.replace(/[""]['']/g, '"');
    
    console.log("parseJsonFromAiResponse: 预处理后的JSON字符串", jsonString.substring(0, 100) + "...");

    // 尝试解析预处理后的JSON
    try {
      return JSON.parse(jsonString);
    } catch (innerError) {
      console.error("parseJsonFromAiResponse: 预处理后的JSON解析失败", innerError);
      
      // 最后的尝试：使用更激进的方法处理JSON
      // 移除所有转义符号，然后重新添加必要的转义
      jsonString = content.replace(/\\"/g, '"'); // 先移除所有转义引号
      
      // 尝试找到JSON对象的开始和结束
      const objectStartMatch = jsonString.match(/\s*\{\s*"[^"]+"\s*:/);
      if (objectStartMatch) {
        const startIndex = objectStartMatch.index || 0;
        let endIndex = jsonString.lastIndexOf("}");
        if (endIndex > startIndex) {
          jsonString = jsonString.substring(startIndex, endIndex + 1);
          console.log("parseJsonFromAiResponse: 提取JSON对象", jsonString.substring(0, 100) + "...");
          
          try {
            return JSON.parse(jsonString);
          } catch (finalError) {
            console.error("parseJsonFromAiResponse: 最终JSON解析失败", finalError);
          }
        }
      }
      
      // 如果还是失败，尝试使用正则表达式提取所有可能的键值对
      console.log("parseJsonFromAiResponse: 尝试使用正则表达式提取键值对");
      
      // 提取键值对
      const keyValuePairs: Record<string, any> = {};
      
      // 提取title
      const titleMatch = content.match(/"title"\s*:\s*"([^"]+)"/);
      if (titleMatch) {
        keyValuePairs.title = titleMatch[1];
      }
      
      // 提取progressStatus
      const progressMatch = content.match(/"progressStatus"\s*:\s*"([^"]+)"/);
      if (progressMatch) {
        keyValuePairs.progressStatus = progressMatch[1];
      }
      
      // 提取bigOutlineEvents数组
      const eventsMatch = content.match(/"bigOutlineEvents"\s*:\s*\[([\s\S]*?)\]/);
      if (eventsMatch) {
        const eventsStr = eventsMatch[1];
        const events = eventsStr.match(/"([^"]+)"/g);
        if (events) {
          keyValuePairs.bigOutlineEvents = events.map(e => e.replace(/"/g, ''));
        }
      }
      
      // 提取scenes数组
      const scenesMatch = content.match(/"scenes"\s*:\s*\[([\s\S]*?)\]/);
      if (scenesMatch) {
        const scenesStr = scenesMatch[1];
        const scenes = scenesStr.match(/"([^"]+)"/g);
        if (scenes) {
          keyValuePairs.scenes = scenes.map(s => s.replace(/"/g, ''));
        }
      }
      
      // 提取characters数组（用于角色生成）
      const charactersMatch = content.match(/"characters"\s*:\s*\[([\s\S]*?)\]/);
      if (charactersMatch) {
        try {
          // 尝试解析整个characters数组
          const charactersStr = `{"characters":[${charactersMatch[1]}]}`;
          const parsed = JSON.parse(charactersStr);
          keyValuePairs.characters = parsed.characters;
        } catch (e) {
          console.error("parseJsonFromAiResponse: 解析characters数组失败", e);
          // 如果整体解析失败，尝试提取单个角色信息
          const characters: any[] = [];
          const charBlocks = charactersMatch[1].split(/},\s*{/);
          
          charBlocks.forEach((block, index) => {
            // 修复第一个和最后一个块的花括号
            if (index === 0 && !block.startsWith('{')) block = '{' + block;
            if (index === charBlocks.length - 1 && !block.endsWith('}')) block = block + '}';
            if (index > 0 && index < charBlocks.length - 1) block = '{' + block + '}';
            
            try {
              const char = JSON.parse(block);
              characters.push(char);
            } catch (e) {
              console.error(`parseJsonFromAiResponse: 解析第${index}个角色失败`, e);
            }
          });
          
          if (characters.length > 0) {
            keyValuePairs.characters = characters;
          }
        }
      }
      
      // 如果至少找到了一些键值对，返回结果
      if (Object.keys(keyValuePairs).length > 0) {
        console.log("parseJsonFromAiResponse: 成功提取键值对", keyValuePairs);
        return keyValuePairs;
      }
      
      throw new Error(`无法解析JSON：${innerError}`);
    }
  } catch (e) {
    console.error("parseJsonFromAiResponse: 所有解析尝试都失败了。原始内容:", content);
    console.error("parseJsonFromAiResponse: 错误详情:", e);
    throw new Error(`AI返回了无效的JSON格式，无法解析: ${e}`);
  }
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
 * 提取大纲中的仅有章节部分（不包含宏观叙事规划）
 * @param content - 完整的大纲内容
 * @returns 只包含章节详情的大纲内容
 */
export const extractChapterDetailFromOutline = (content: string): string => {
  if (!content) return '';
  
  console.log(`[大纲提取] 开始提取章节部分，原始大纲长度: ${content.length}`);
  
  // 使用正则表达式匹配所有章节标记
  const allChapterMatches = content.match(/第\s*\d+\s*\.?\s*章[:\：]?/gi);
  if (allChapterMatches) {
    console.log(`[大纲提取] 在整个大纲中找到 ${allChapterMatches.length} 个章节标记`);
    console.log(`[大纲提取] 前5个章节标记: ${JSON.stringify(allChapterMatches.slice(0, 5))}`);
    if (allChapterMatches.length > 5) {
      console.log(`[大纲提取] 后5个章节标记: ${JSON.stringify(allChapterMatches.slice(-5))}`);
    }
  } else {
    console.log(`[大纲提取] 警告: 在整个大纲中未找到任何章节标记`);
    return content; // 如果没有找到任何章节标记，返回原始内容
  }
  
  // 如果包含宏观叙事规划部分，需要特殊处理
  if (content.includes('宏观叙事规划')) {
    console.log(`[大纲提取] 检测到宏观叙事规划分隔符`);
    const parts = content.split(MACRO_PLANNING_SEPARATOR_REGEX);
    
    if (parts.length >= 2) {
      console.log(`[大纲提取] 成功分离前半部分和宏观规划部分`);
      
      // 提取分隔符前的章节内容
      const beforePlanningPart = parts[0].trim();
      const beforeChapterMarkers = beforePlanningPart.match(/第\s*\d+\s*\.?\s*章[:\：]?/gi);
      console.log(`[大纲提取] 分隔符前找到 ${beforeChapterMarkers?.length || 0} 个章节标记`);
      
      // 提取分隔符后的内容
      const afterPlanningPart = parts[1].trim();
      
      // 在分隔符后的内容中查找章节标记
      const afterChapterMarkers = afterPlanningPart.match(/第\s*\d+\s*\.?\s*章[:\：]?/gi);
      if (afterChapterMarkers && afterChapterMarkers.length > 0) {
        console.log(`[大纲提取] 分隔符后找到 ${afterChapterMarkers.length} 个章节标记`);
        console.log(`[大纲提取] 分隔符后的章节标记: ${JSON.stringify(afterChapterMarkers.slice(0, 5))}`);
        
        // 提取分隔符后的章节内容
        // 找到第一个章节标记的位置
        const firstChapterIndex = afterPlanningPart.indexOf(afterChapterMarkers[0]);
        if (firstChapterIndex !== -1) {
          // 提取从第一个章节标记开始到结尾的所有内容
          const afterChapterContent = afterPlanningPart.substring(firstChapterIndex);
          
          // 合并前后章节内容
          const combinedChapterContent = beforePlanningPart + "\n\n" + afterChapterContent;
          
          // 检查合并后的内容中的章节标记
          const combinedChapterMarkers = combinedChapterContent.match(/第\s*\d+\s*\.?\s*章[:\：]?/gi);
          console.log(`[大纲提取] 合并后找到 ${combinedChapterMarkers?.length || 0} 个章节标记`);
          
          console.log(`[大纲提取] 成功合并前后章节内容，总长度: ${combinedChapterContent.length}`);
          return combinedChapterContent;
        }
      }
      
      // 如果分隔符后没有找到章节标记，只返回前半部分
      console.log(`[大纲提取] 分隔符后未找到章节标记，只返回前半部分`);
      return beforePlanningPart;
    }
  }
  
  // 如果没有宏观叙事规划分隔符，尝试提取所有章节内容
  console.log(`[大纲提取] 未检测到宏观叙事规划分隔符，尝试提取所有章节内容`);
  
  // 尝试提取所有章节内容
  let lastIndex = content.lastIndexOf(allChapterMatches![allChapterMatches!.length - 1]);
  if (lastIndex !== -1) {
    console.log(`[大纲提取] 找到最后一个章节标记: ${allChapterMatches![allChapterMatches!.length - 1]}`);
    
    // 找到最后一个章节后的下一个明显分隔（如多个换行或分隔符）
    const afterLastChapter = content.substring(lastIndex);
    const separatorMatch = afterLastChapter.match(/\n{3,}|---+/);
    if (separatorMatch && separatorMatch.index) {
      const extractedContent = content.substring(0, lastIndex + separatorMatch.index).trim();
      console.log(`[大纲提取] 成功提取章节内容，长度: ${extractedContent.length}`);
      return extractedContent;
    } else {
      // 如果没有找到分隔符，返回从第一个章节开始到结尾的所有内容
      const firstChapterIndex = content.indexOf(allChapterMatches![0]);
      const extractedContent = content.substring(firstChapterIndex).trim();
      console.log(`[大纲提取] 未找到最后一个章节后的分隔符，返回从第一个章节到结尾的内容，长度: ${extractedContent.length}`);
      return extractedContent;
    }
  }
  
  // 如果无法明确区分，返回原始内容
  console.log(`[大纲提取] 无法明确区分章节部分，返回原始内容`);
  return content;
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
  if (!content) return [];
  
  console.log(`[宏观规划提取] 开始提取宏观叙事规划，原始大纲长度: ${content.length}`);
  
  // 直接将传入的content作为宏观规划部分进行处理，移除之前错误的分割逻辑
  const macroPlanningPart = content.trim();
  
  // 匹配多种宏观叙事阶段格式，核心是寻找括号内的 `xx-xx` 数字范围
  // 新版Regex通过匹配以章节范围结尾的整行来识别标题，更健壮
  const stageRegex = /^\s*(?:\*\*)?(.+?)\s*\([^)\d]*(\d+)\s*-\s*(\d+)[^)\d]*\)(?:\*\*)?\s*$/gm;
  const stages: NarrativeStage[] = [];
  console.log(`[宏观规划提取] 开始匹配宏观叙事阶段`);
  
  // 使用字符串的match方法获取所有匹配，避免使用exec的状态
  const allMatches = Array.from(macroPlanningPart.matchAll(stageRegex));
  console.log(`[宏观规划提取] 找到 ${allMatches.length} 个阶段匹配`);

  for (let i = 0; i < allMatches.length; i++) {
    const match = allMatches[i];
    
    // 从第一个捕获组中分离出 stageName 和 stageTitle
    const fullTitle = match[1].trim();
    const titleParts = fullTitle.split(/:\s*/, 2);
    const stageName = titleParts[0] || '';
    const stageTitle = titleParts[1] || '';

    const startChapter = parseInt(match[2], 10);
    const endChapter = parseInt(match[3], 10);
    
    // 提取该阶段的核心概述
    const stageStart = match.index! + match[0].length;
    let stageEnd = macroPlanningPart.length;
    
    // 寻找下一个阶段的开始位置
    if (i < allMatches.length - 1) {
      stageEnd = allMatches[i + 1].index!;
    }
   
    // 提取阶段内容
    let stageContent = macroPlanningPart.substring(stageStart, stageEnd).trim();
    
    // 整个阶段内容就是核心概述
    // 移除开头的-、*、空格等列表标记
    const coreSummary = stageContent.replace(/^[\s*\-•]+/, '').trim();
    
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
  stages.forEach((stage, index) => {
    console.log(`[宏观规划提取] 阶段 ${index + 1}: ${stage.stageName} (第${stage.chapterRange.start}-${stage.chapterRange.end}章)`);
  });
  
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