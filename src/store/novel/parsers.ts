/**
 * 解析相关的工具函数
 */

/**
 * 从AI返回的可能包含Markdown代码块的字符串中安全地解析JSON。
 * @param content - AI返回的原始字符串
 * @returns 解析后的JavaScript对象
 * @throws 如果找不到或无法解析JSON，则抛出错误
 */
export const parseJsonFromAiResponse = (content: string): any => {
  try {
    return JSON.parse(content);
  } catch (e) {
    console.warn("Direct JSON parsing failed, attempting fallback.", e);
  }

  try {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```|(\{[\s\S]*\})/);
    let jsonString = match ? (match[1] || match[2]) : content;

    jsonString = jsonString.replace(/[""]['']/g, '"');

    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Fallback JSON parsing also failed. Original content:", content);
    throw new Error(`AI返回了无效的JSON格式，即使在清理和提取后也无法解析。`);
  }
};

/**
 * 清理AI生成的大纲内容，移除前缀说明文字和格式化内容。
 * @param content - AI返回的原始大纲内容
 * @returns 清理后的大纲内容，只包含章节详情和宏观规划
 */
export const processOutline = (content: string): string => {
  if (!content) return '';
  
  // 移除可能的AI回复前缀，如"好的，身为一位经验丰富的小说编辑..."
  // 匹配从开头到第一个"第X章:"出现之前的所有内容
  // 使用更宽松的正则表达式，匹配更多格式的章节标记
  let cleanedContent = content.replace(/^[\s\S]*?(?=第\s*\d+\s*\.?\s*章[:\：]?)/i, '');
  
  // 如果没有找到章节标记，返回原始内容
  if (cleanedContent === content && !content.match(/第\s*\d+\s*\.?\s*章[:\：]?/i)) {
    console.log('[大纲处理] 未找到章节标记，返回原始内容');
    return content;
  }
  
  // 去除可能的额外空行
  cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n');
  
  // 标准化章节标记格式
  // 将各种格式的章节标记统一为"第X章: "格式
  cleanedContent = cleanedContent.replace(/第\s*(\d+)\s*\.?\s*章[:\：]?\s*/gi, (match, chapterNum) => {
    return `第${chapterNum}章: `;
  });
  
  console.log('[大纲处理] 章节标记标准化完成');
  
  // 确保宏观叙事规划部分格式正确
  if (cleanedContent.includes('宏观叙事规划')) {
    // 分离章节详情和宏观规划
    const parts = cleanedContent.split(/---\s*\*\*宏观叙事规划\*\*\s*---/i);
    if (parts.length >= 2) {
      const chapterDetail = parts[0].trim();
      const macroPlanning = parts[1].trim();
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
    const parts = content.split(/---\s*\*\*宏观叙事规划\*\*\s*---/i);
    
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
  
  // 检查是否包含宏观叙事规划部分
  if (!content.includes('宏观叙事规划')) {
    console.log(`[宏观规划提取] 未检测到宏观叙事规划分隔符`);
    return [];
  }
  
  // 分离宏观规划部分
  const parts = content.split(/---\s*\*\*宏观叙事规划\*\*\s*---/i);
  if (parts.length < 2) {
    console.log(`[宏观规划提取] 无法分离宏观规划部分`);
    return [];
  }
  
  const macroPlanningPart = parts[1].trim();
  console.log(`[宏观规划提取] 宏观规划部分长度: ${macroPlanningPart.length}`);
  
  // 匹配宏观叙事阶段，如"**第一幕: 幸存者的试炼 (第1-100章)**"
  const stageRegex = /\*\*([^:]+):\s*([^(]+)\s*\(第(\d+)-(\d+)章\)\*\*/g;
  const stages: NarrativeStage[] = [];
  
  let match;
  while ((match = stageRegex.exec(macroPlanningPart)) !== null) {
    const stageName = match[1].trim();
    const stageTitle = match[2].trim();
    const startChapter = parseInt(match[3], 10);
    const endChapter = parseInt(match[4], 10);
    
    // 提取该阶段的核心概述
    const stageStart = match.index + match[0].length;
    let stageEnd = macroPlanningPart.length;
    
    // 寻找下一个阶段的开始位置
    const nextStageMatch = stageRegex.exec(macroPlanningPart);
    if (nextStageMatch) {
      stageEnd = nextStageMatch.index;
      // 重置正则表达式的lastIndex，使其回到当前匹配之后
      stageRegex.lastIndex = match.index + match[0].length;
    }
    
    // 提取阶段内容
    let stageContent = macroPlanningPart.substring(stageStart, stageEnd).trim();
    
    // 提取核心概述
    let coreSummary = "";
    const coreSummaryMatch = stageContent.match(/核心概述:\s*([\s\S]+?)(?=\n\n|\n-|\n\*|$)/);
    if (coreSummaryMatch) {
      coreSummary = coreSummaryMatch[1].trim();
    }
    
    // 提取关键元素（如有）
    const keyElements: string[] = [];
    const keyElementsRegex = /-\s*([^\n]+)/g;
    let elementMatch;
    while ((elementMatch = keyElementsRegex.exec(stageContent)) !== null) {
      keyElements.push(elementMatch[1].trim());
    }
    
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