/**
 * 章节宏观叙事规划检查相关的函数
 */


import { extractNarrativeStages, getCurrentNarrativeStage } from '../parsers';

/**
 * 检查章节内容是否符合宏观叙事规划
 * @param chapterContent - 章节内容
 * @param chapterNumber - 章节编号
 * @param fullOutline - 完整大纲
 * @returns 是否符合规划，以及不符合的原因
 */
export const checkChapterComplianceWithNarrativePlan = (
  chapterContent: string,
  chapterNumber: number,
  fullOutline: string
): { compliant: boolean; reason?: string } => {
  // 提取宏观叙事规划
  const narrativeStages = extractNarrativeStages(fullOutline);
  if (narrativeStages.length === 0) {
    // 如果没有宏观叙事规划，则认为章节符合规划
    return { compliant: true };
  }

  // 确定当前章节所处的叙事阶段
  const currentStage = getCurrentNarrativeStage(narrativeStages, chapterNumber);
  if (!currentStage) {
    return { compliant: true }; // 无法确定阶段，则认为符合规划
  }

  // 获取下一个阶段（如果有）
  const currentStageIndex = narrativeStages.findIndex(stage => 
    stage.chapterRange.start === currentStage.chapterRange.start && 
    stage.chapterRange.end === currentStage.chapterRange.end
  );
  
  const nextStage = currentStageIndex < narrativeStages.length - 1 ? narrativeStages[currentStageIndex + 1] : null;
  
  if (!nextStage) {
    return { compliant: true }; // 如果没有下一个阶段，则认为符合规划
  }

  // 更合理的检查方法：检查下一阶段的关键概念和事件是否在当前章节中出现
  
  // 1. 从下一个阶段的核心概述中提取关键概念和事件
  const nextStageConcepts = extractKeyConcepts(nextStage.coreSummary);
  
  // 2. 检查这些关键概念是否在当前章节中出现
  const foundConcepts = nextStageConcepts.filter(concept => 
    containsConcept(chapterContent, concept)
  );
  
  // 3. 如果发现了超过阈值数量的关键概念，则认为章节不符合规划
  if (foundConcepts.length >= 3) {
    return { 
      compliant: false, 
      reason: `章节内容过早引入了属于"${nextStage.stageName}"阶段的关键概念: ${foundConcepts.join(', ')}` 
    };
  }
  
  return { compliant: true };
};

/**
 * 从文本中提取关键概念和事件
 * @param text - 要分析的文本
 * @returns 关键概念和事件数组
 */
const extractKeyConcepts = (text: string): string[] => {
  const concepts: string[] = [];
  
  // 1. 提取引号中的内容（通常是重要概念、名词或事件）
  const quotedContent = text.match(/["'"']([^"'"']+)["'"']/g);
  if (quotedContent) {
    quotedContent.forEach(content => {
      // 移除引号
      const cleanContent = content.replace(/["'"'"]/g, '').trim();
      if (cleanContent.length >= 2) {
        concepts.push(cleanContent);
      }
    });
  }
  
  // 2. 提取冒号后的内容（通常是定义或重要说明）
  const colonContent = text.split(/[：:]/);
  if (colonContent.length > 1) {
    for (let i = 1; i < colonContent.length; i++) {
      const content = colonContent[i].trim().split(/[,.;。，；]/)[0].trim();
      if (content.length >= 2 && content.length <= 10) {
        concepts.push(content);
      }
    }
  }
  
  // 3. 提取包含特定标志词的短语（表示重要事件或转折）
  const eventMarkers = ['发现', '出现', '获得', '突破', '觉醒', '开始', '结束', '死亡', '诞生', 
                       '崛起', '陨落', '征服', '战争', '和平', '联盟', '背叛', '真相', '秘密'];
  
  eventMarkers.forEach(marker => {
    if (text.includes(marker)) {
      // 提取包含标志词的短句
      const regex = new RegExp(`[^。！？.!?]*${marker}[^。！？.!?]*`, 'g');
      const matches = text.match(regex);
      if (matches) {
        matches.forEach(match => {
          if (match.length >= 5 && match.length <= 30) {
            concepts.push(match.trim());
          }
        });
      }
    }
  });
  
  // 去重
  return Array.from(new Set(concepts));
};

/**
 * 检查文本是否包含特定概念
 * @param text - 要检查的文本
 * @param concept - 要查找的概念
 * @returns 是否包含该概念
 */
const containsConcept = (text: string, concept: string): boolean => {
  // 对于短概念（2-3个字），需要精确匹配
  if (concept.length <= 3) {
    return text.includes(concept);
  }
  
  // 对于较长概念，如果文本包含概念的70%以上的字符，则认为匹配
  // 这是一个简化的模糊匹配方法
  const conceptChars = concept.split('');
  let matchCount = 0;
  
  conceptChars.forEach(char => {
    if (text.includes(char)) {
      matchCount++;
    }
  });
  
  const matchRatio = matchCount / conceptChars.length;
  return matchRatio >= 0.7;
};

