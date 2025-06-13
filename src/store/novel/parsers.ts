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
  
  // 如果包含宏观叙事规划部分，只返回前半部分
  if (content.includes('宏观叙事规划')) {
    console.log(`[大纲提取] 检测到宏观叙事规划分隔符`);
    const parts = content.split(/---\s*\*\*宏观叙事规划\*\*\s*---/i);
    if (parts.length >= 2) {
      console.log(`[大纲提取] 成功分离章节部分和宏观规划部分`);
      const chapterPart = parts[0].trim();
      console.log(`[大纲提取] 提取到的章节部分长度: ${chapterPart.length}`);
      
      // 检查章节部分中的章节标记
      const chapterMarkers = chapterPart.match(/第\s*\d+\s*\.?\s*章[:\：]?/gi);
      if (chapterMarkers) {
        console.log(`[大纲提取] 章节部分中找到 ${chapterMarkers.length} 个章节标记`);
        console.log(`[大纲提取] 前5个章节标记: ${JSON.stringify(chapterMarkers.slice(0, 5))}`);
      } else {
        console.log(`[大纲提取] 警告: 章节部分中未找到章节标记`);
      }
      
      return chapterPart;
    }
  }
  
  // 如果找不到分隔符，检查是否有明显的章节标记
  // 使用更宽松的正则表达式，匹配更多格式的章节标记
  const chapterMatches = content.match(/第\s*\d+\s*\.?\s*章[:\：]?/gi);
  if (chapterMatches && chapterMatches.length > 0) {
    console.log(`[大纲提取] 找到 ${chapterMatches.length} 个章节标记`);
    console.log(`[大纲提取] 前5个章节标记: ${JSON.stringify(chapterMatches.slice(0, 5))}`);
    
    // 尝试提取所有章节内容
    let lastIndex = content.lastIndexOf(chapterMatches[chapterMatches.length - 1]);
    if (lastIndex !== -1) {
      console.log(`[大纲提取] 找到最后一个章节标记: ${chapterMatches[chapterMatches.length - 1]}`);
      
      // 找到最后一个章节后的下一个明显分隔（如多个换行或分隔符）
      const afterLastChapter = content.substring(lastIndex);
      const separatorMatch = afterLastChapter.match(/\n{3,}|---+/);
      if (separatorMatch && separatorMatch.index) {
        const extractedContent = content.substring(0, lastIndex + separatorMatch.index).trim();
        console.log(`[大纲提取] 成功提取章节内容，长度: ${extractedContent.length}`);
        return extractedContent;
      } else {
        console.log(`[大纲提取] 未找到最后一个章节后的分隔符，返回整个内容`);
      }
    }
  } else {
    console.log(`[大纲提取] 警告: 未找到任何章节标记`);
  }
  
  // 如果无法明确区分，返回原始内容
  console.log(`[大纲提取] 无法明确区分章节部分，返回原始内容`);
  return content;
}; 