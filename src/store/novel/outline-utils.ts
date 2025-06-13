/**
 * 大纲处理相关的工具函数
 */

/**
 * 计算大纲字符串中详细章节的数量
 * @param outline - 剧情大纲字符串
 * @returns 详细章节的数量
 */
export const countDetailedChaptersInOutline = (outline: string): number => {
  const detailedChapterRegex = /第\d+章:/g;
  const matches = outline.match(detailedChapterRegex);
  return matches ? matches.length : 0;
};

/**
 * 从完整大纲中提取特定章节的剧情摘要
 * @param outline - 剧情大纲字符串
 * @param chapterNumber - 目标章节编号
 * @returns 特定章节的剧情摘要，如果找不到则返回 null
 */
export const getChapterOutline = (outline: string, chapterNumber: number): string | null => {
  // 增强版正则表达式，匹配多种可能的章节标记格式
  // 包括: "第X章:", "第 X 章:", "第X.章:", "第 X. 章:" 等变体
  const regex = new RegExp(`第\\s*${chapterNumber}\\s*\\.?\\s*章:?([\\s\\S]*?)(?=\\n*第\\s*\\d+\\s*\\.?\\s*章:|$)`, 'i');
  
  console.log(`[诊断] 尝试从大纲中匹配第 ${chapterNumber} 章内容`);
  
  // 为了帮助诊断，记录大纲的前200个字符
  console.log(`[诊断] 大纲前200字符: ${outline.substring(0, 200)}...`);
  
  const match = outline.match(regex);
  
  if (match && match[1]) {
    console.log(`[诊断] 成功匹配到第 ${chapterNumber} 章内容，前50字符: ${match[1].trim().substring(0, 50)}...`);
    return match[1].trim();
  } else {
    console.log(`[诊断] 未能匹配到第 ${chapterNumber} 章内容`);
    
    // 尝试查找所有章节标记，帮助诊断
    const allChaptersRegex = /第\s*\d+\s*\.?\s*章:?/gi;
    const allChapters = outline.match(allChaptersRegex);
    if (allChapters) {
      console.log(`[诊断] 在大纲中找到的所有章节标记: ${JSON.stringify(allChapters.slice(0, 10))}`);
      
      // 提取所有章节编号
      const chapterNumbers = extractChapterNumbers(outline);
      
      // 尝试查找可能的映射关系，使用评分系统
      if (chapterNumbers.length > 0) {
        // 检查是否有编号映射问题
        const possibleMappings = chapterNumbers.map(num => {
          let score = 0;
          const numStr = num.toString();
          const targetStr = chapterNumber.toString();
          
          // 精确匹配得分最高
          if (num === chapterNumber) {
            score = 100;
          }
          // 可能是AI把11写成了1-1（第1-1章），或者类似情况
          else if (num === chapterNumber - 1 || num === chapterNumber + 1) {
            score = 80;
          }
          else if (numStr.length >= 2 && numStr.startsWith(targetStr) && numStr.endsWith(targetStr)) {
            score = 70;
          }
          else if (num === chapterNumber * 10 && chapterNumber >= 7) {
            score = 50;
          }
          else if (num === chapterNumber * 11 && chapterNumber >= 7) {
            score = 50;
          }
          else if (numStr.startsWith(targetStr) && numStr.length > targetStr.length) {
            if (chapterNumber >= 10) {
              score = 30;
            } else {
              score = 0;
            }
          }
          
          return { num, score };
        }).filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score); // 按分数从高到低排序
        
        if (possibleMappings.length > 0) {
          console.log(`[诊断] 发现可能的章节编号映射: ${JSON.stringify(possibleMappings.map(m => `${m.num}(分数:${m.score})`))}`)
          
          // 尝试使用得分最高的映射
          const alternativeNumber = possibleMappings[0].num;
          const alternativeRegex = new RegExp(`第\\s*${alternativeNumber}\\s*\\.?\\s*章:?([\\s\\S]*?)(?=\\n*第\\s*\\d+\\s*\\.?\\s*章:|$)`, 'i');
          const alternativeMatch = outline.match(alternativeRegex);
          
          if (alternativeMatch && alternativeMatch[1]) {
            console.log(`[诊断] 使用替代编号 ${alternativeNumber} 成功匹配到内容`);
            return alternativeMatch[1].trim();
          }
        }
        
        // 新增：顺序推断法 - 通过查找前后章节来推断目标章节位置
        console.log(`[诊断] 尝试使用顺序推断法查找第 ${chapterNumber} 章内容`);
        
        // 尝试查找上一章(X-1)的内容
        const prevChapterRegex = new RegExp(`第\\s*${chapterNumber - 1}\\s*\\.?\\s*章:?([\\s\\S]*?)(?=\\n*第\\s*\\d+\\s*\\.?\\s*章:|$)`, 'i');
        const prevMatch = outline.match(prevChapterRegex);
        
        // 尝试查找下一章(X+1)的内容
        const nextChapterRegex = new RegExp(`第\\s*${chapterNumber + 1}\\s*\\.?\\s*章:?`, 'i');
        const nextMatch = outline.match(nextChapterRegex);
        
        // 如果能找到上一章和下一章的标记位置
        if (prevMatch && nextMatch && prevMatch.index !== undefined && nextMatch.index !== undefined) {
          console.log(`[诊断] 找到了第 ${chapterNumber - 1} 章和第 ${chapterNumber + 1} 章的标记`);
          
          // 获取上一章结束位置（上一章标记位置 + 上一章标记长度 + 上一章内容长度）
          const prevChapterEnd = prevMatch.index + prevMatch[0].length + prevMatch[1].length;
          
          // 获取下一章开始位置
          const nextChapterStart = nextMatch.index;
          
          // 如果两者之间有内容（可能是我们要找的章节）
          if (nextChapterStart > prevChapterEnd) {
            const possibleChapterContent = outline.substring(prevChapterEnd, nextChapterStart).trim();
            
            // 检查内容中是否有章节标记（如果有另一个章节标记，很可能就是我们要找的）
            const chapterMarkerInBetween = possibleChapterContent.match(/第\s*\d+\s*\.?\s*章:?/i);
            
            if (chapterMarkerInBetween) {
              console.log(`[诊断] 在第 ${chapterNumber - 1} 章和第 ${chapterNumber + 1} 章之间找到了章节标记: "${chapterMarkerInBetween[0]}"`);
              
              // 提取章节标记后的内容
              const markerPosition = possibleChapterContent.indexOf(chapterMarkerInBetween[0]);
              const contentAfterMarker = possibleChapterContent.substring(markerPosition + chapterMarkerInBetween[0].length).trim();
              
              console.log(`[诊断] 通过顺序推断法找到的内容前50字符: ${contentAfterMarker.substring(0, 50)}...`);
              return contentAfterMarker;
            } else {
              // 如果没有章节标记，可能整个内容就是我们要找的章节
              console.log(`[诊断] 在第 ${chapterNumber - 1} 章和第 ${chapterNumber + 1} 章之间没有找到章节标记，但有内容`);
              console.log(`[诊断] 推断内容前50字符: ${possibleChapterContent.substring(0, 50)}...`);
              return possibleChapterContent;
            }
          } else {
            console.log(`[诊断] 第 ${chapterNumber - 1} 章和第 ${chapterNumber + 1} 章之间没有足够的内容`);
          }
        } else {
          console.log(`[诊断] 无法同时找到第 ${chapterNumber - 1} 章和第 ${chapterNumber + 1} 章的标记`);
        }
        
        // 如果仍然找不到，尝试按索引查找
        if (chapterNumber <= chapterNumbers.length) {
          console.log(`[诊断] 尝试按索引查找第 ${chapterNumber} 章内容（实际索引: ${chapterNumber - 1}）`);
          return getChapterOutlineByIndex(outline, chapterNumber - 1);
        }
      }
    } else {
      console.log(`[诊断] 在大纲中未找到任何章节标记`);
    }
    
    return null;
  }
};

/**
 * 根据索引从大纲中提取特定章节的剧情摘要
 * @param outline - 剧情大纲字符串
 * @param index - 章节索引（从0开始）
 * @returns 特定章节的剧情摘要，如果找不到则返回 null
 */
export const getChapterOutlineByIndex = (outline: string, index: number): string | null => {
  const chapterMarkerRegex = /第\s*\d+\s*\.?\s*章:?/gi;
  const matches = outline.match(chapterMarkerRegex);
  
  if (!matches || index >= matches.length) {
    console.log(`[诊断] 索引 ${index} 超出了大纲中章节标记的数量 ${matches?.length || 0}`);
    return null;
  }
  
  const chapterMarker = matches[index];
  const startPos = outline.indexOf(chapterMarker);
  
  if (startPos === -1) {
    console.log(`[诊断] 无法在大纲中找到章节标记 "${chapterMarker}"`);
    return null;
  }
  
  let endPos;
  if (index < matches.length - 1) {
    const nextChapterMarker = matches[index + 1];
    endPos = outline.indexOf(nextChapterMarker, startPos + chapterMarker.length);
  } else {
    endPos = outline.length;
  }
  
  if (endPos === -1) {
    endPos = outline.length;
  }
  
  const chapterContent = outline.substring(startPos + chapterMarker.length, endPos).trim();
  console.log(`[诊断] 通过索引 ${index} 找到章节内容，章节标记为 "${chapterMarker}"`);
  console.log(`[诊断] 内容前50字符: ${chapterContent.substring(0, 50)}...`);
  
  return chapterContent;
};

/**
 * 从大纲中提取所有章节编号
 * @param outline - 剧情大纲字符串
 * @returns 包含所有章节编号的数组
 */
export const extractChapterNumbers = (outline: string): number[] => {
  // 增强版正则表达式，匹配更多格式的章节标记
  // 1. 标准格式: "第10章:"
  // 2. 带空格: "第 10 章:"
  // 3. 带句点: "第10.章:"
  // 4. 不带冒号: "第10章"
  // 5. 中英文冒号: "第10章："
  const chapterNumberRegex = /第\s*(\d+)\s*\.?\s*章[:\：]?/gi;
  
  // 为诊断目的，先获取所有完整的章节标记
  const allMarkers = outline.match(chapterNumberRegex);
  if (allMarkers) {
    console.log(`[诊断] 匹配到的所有章节标记: ${JSON.stringify(allMarkers.slice(0, 15))}`);
  } else {
    console.log(`[诊断] 未匹配到任何章节标记，检查大纲格式`);
    // 输出大纲的前100个字符，帮助诊断
    console.log(`[诊断] 大纲前100字符: ${outline.substring(0, 100)}`);
    
    // 尝试匹配任何可能是章节标记的内容
    const looseMatches = outline.match(/第.{0,5}\d+.{0,5}章.{0,3}/g);
    if (looseMatches) {
      console.log(`[诊断] 宽松匹配找到的可能章节标记: ${JSON.stringify(looseMatches.slice(0, 15))}`);
    }
  }
  
  const numbers: number[] = [];
  let match;
  
  while ((match = chapterNumberRegex.exec(outline)) !== null) {
    if (match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }
  }
  
  console.log(`[诊断] 从大纲中提取到的章节编号: ${JSON.stringify(numbers)}`);
  
  // 如果没有找到任何章节编号，尝试使用更宽松的正则表达式
  if (numbers.length === 0) {
    console.log(`[诊断] 使用备用正则表达式尝试匹配章节编号`);
    
    // 备用正则表达式，更宽松的匹配
    const backupRegex = /第[^\d]*(\d+)[^\d]*章/gi;
    while ((match = backupRegex.exec(outline)) !== null) {
      if (match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) {
          numbers.push(num);
        }
      }
    }
    
    console.log(`[诊断] 备用正则表达式匹配到的章节编号: ${JSON.stringify(numbers)}`);
  }
  
  return numbers;
}; 