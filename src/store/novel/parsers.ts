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
  let cleanedContent = content.replace(/^[\s\S]*?(?=第\s*\d+\s*\.?\s*章\s*:)/i, '');
  
  // 如果没有找到章节标记，返回原始内容
  if (cleanedContent === content && !content.match(/第\s*\d+\s*\.?\s*章\s*:/i)) {
    return content;
  }
  
  // 去除可能的额外空行
  cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n');
  
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
  
  // 如果包含宏观叙事规划部分，只返回前半部分
  if (content.includes('宏观叙事规划')) {
    const parts = content.split(/---\s*\*\*宏观叙事规划\*\*\s*---/i);
    if (parts.length >= 2) {
      return parts[0].trim();
    }
  }
  
  // 如果找不到分隔符，检查是否有明显的章节标记
  const chapterMatches = content.match(/第\s*\d+\s*\.?\s*章\s*:/gi);
  if (chapterMatches && chapterMatches.length > 0) {
    // 尝试提取所有章节内容
    let lastIndex = content.lastIndexOf(chapterMatches[chapterMatches.length - 1]);
    if (lastIndex !== -1) {
      // 找到最后一个章节后的下一个明显分隔（如多个换行或分隔符）
      const afterLastChapter = content.substring(lastIndex);
      const separatorMatch = afterLastChapter.match(/\n{3,}|---+/);
      if (separatorMatch && separatorMatch.index) {
        return content.substring(0, lastIndex + separatorMatch.index).trim();
      }
    }
  }
  
  // 如果无法明确区分，返回原始内容
  return content;
}; 