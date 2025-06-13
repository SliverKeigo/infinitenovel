/**
 * 章节宏观叙事规划检查相关的函数
 */

import { db } from '@/lib/db';
import { toast } from "sonner";
import { Chapter } from '@/types/chapter';
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

  // 检查章节内容是否包含下一个阶段的关键元素
  // 这里我们使用一个简单的方法：检查章节内容是否包含下一个阶段核心概述中的关键词或短语
  
  // 将下一个阶段的核心概述拆分为关键词和短语
  const nextStageKeywords = extractKeywordsAndPhrases(nextStage.coreSummary);
  
  // 检查章节内容是否包含这些关键词或短语
  const forbiddenElements = nextStageKeywords.filter(keyword => 
    chapterContent.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (forbiddenElements.length > 0) {
    return { 
      compliant: false, 
      reason: `章节内容过早引入了属于"${nextStage.stageName}"阶段的元素: ${forbiddenElements.join(', ')}` 
    };
  }
  
  return { compliant: true };
};

/**
 * 从文本中提取关键词和短语
 * @param text - 要分析的文本
 * @returns 关键词和短语数组
 */
const extractKeywordsAndPhrases = (text: string): string[] => {
  // 这里使用一个简单的方法：按句子分割，然后提取每个句子中的名词短语
  // 在实际应用中，可以使用更复杂的NLP技术来提取关键词和短语
  
  // 按句子分割
  const sentences = text.split(/[.!?。！？]/);
  
  // 提取每个句子中的名词短语
  const keywords: string[] = [];
  
  sentences.forEach(sentence => {
    const trimmedSentence = sentence.trim();
    if (trimmedSentence.length > 0) {
      // 提取引号中的内容作为关键短语
      const quotedPhrases = trimmedSentence.match(/"([^"]+)"|"([^"]+)"|'([^']+)'/g);
      if (quotedPhrases) {
        quotedPhrases.forEach(phrase => {
          // 移除引号
          const cleanPhrase = phrase.replace(/["'"]/g, '').trim();
          if (cleanPhrase.length > 0) {
            keywords.push(cleanPhrase);
          }
        });
      }
      
      // 提取专有名词（大写开头的词组）
      const properNouns = trimmedSentence.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
      if (properNouns) {
        properNouns.forEach(noun => {
          if (noun.length > 0) {
            keywords.push(noun);
          }
        });
      }
      
      // 提取长度大于3的词作为可能的关键词
      const words = trimmedSentence.split(/\s+/);
      words.forEach(word => {
        const cleanWord = word.replace(/[,.;:()[\]{}'"]/g, '').trim();
        if (cleanWord.length > 3 && !keywords.includes(cleanWord)) {
          keywords.push(cleanWord);
        }
      });
    }
  });
  
  // 移除常见的停用词
  const stopwords = ['the', 'and', 'that', 'this', 'with', 'for', 'from', 'they', 'their', 'them'];
  return keywords.filter(word => !stopwords.includes(word.toLowerCase()));
};

/**
 * 批量检查章节是否符合宏观叙事规划
 * @param novelId - 小说ID
 * @returns 不符合规划的章节列表
 */
export const batchCheckChaptersCompliance = async (
  novelId: number | undefined
): Promise<Chapter[]> => {
  if (novelId === undefined) {
    toast.error("无效的小说ID");
    return [];
  }

  try {
    // 获取小说信息
    const novel = await db.novels.get(novelId);
    if (!novel) {
      toast.error("未找到小说");
      return [];
    }
    
    // 获取所有章节
    const chapters = await db.chapters.where('novelId').equals(novelId).toArray();
    
    // 检查每个章节是否符合宏观叙事规划
    const nonCompliantChapters: Chapter[] = [];
    
    for (const chapter of chapters) {
      const { compliant, reason } = checkChapterComplianceWithNarrativePlan(
        chapter.content,
        chapter.chapterNumber,
        novel.plotOutline || ""
      );
      
      if (!compliant) {
        console.log(`第 ${chapter.chapterNumber} 章不符合宏观叙事规划: ${reason}`);
        nonCompliantChapters.push({
          ...chapter,
          title: `${chapter.title} [不符合规划: ${reason}]`
        });
      }
    }
    
    return nonCompliantChapters;
  } catch (error) {
    console.error("批量检查章节失败:", error);
    toast.error(`批量检查章节失败: ${error instanceof Error ? error.message : '未知错误'}`);
    return [];
  }
}; 