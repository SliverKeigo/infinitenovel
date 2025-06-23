/**
 * 大纲处理相关的工具函数
 */

/**
 * 计算大纲字符串中详细章节的数量
 * @param outline - 剧情大纲字符串
 * @returns 详细章节的数量
 */
export const countDetailedChaptersInOutline = (outline: string): number => {
  // 使用与extractChapterNumbers相同的正则表达式，保持一致性
  // 匹配多种可能的章节标记格式：
  // 1. 标准格式: "第10章:"
  // 2. 带空格: "第 10 章:"
  // 3. 带句点: "第10.章:"
  // 4. 不带冒号: "第10章"
  // 5. 中英文冒号: "第10章："
  const detailedChapterRegex = /第\s*\d+\s*\.?\s*章[:\：]?/gi;
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
  
  const match = outline.match(regex);
  
  if (match && match[1]) {
    return match[1].trim();
  } else {
    
    // 尝试查找所有章节标记，帮助诊断
    const allChaptersRegex = /第\s*\d+\s*\.?\s*章:?/gi;
    const allChapters = outline.match(allChaptersRegex);
    if (allChapters) {
      
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
          
          // 尝试使用得分最高的映射
          const alternativeNumber = possibleMappings[0].num;
          const alternativeRegex = new RegExp(`第\\s*${alternativeNumber}\\s*\\.?\\s*章:?([\\s\\S]*?)(?=\\n*第\\s*\\d+\\s*\\.?\\s*章:|$)`, 'i');
          const alternativeMatch = outline.match(alternativeRegex);
          
          if (alternativeMatch && alternativeMatch[1]) {
            return alternativeMatch[1].trim();
          }
        }
        
        // 新增：顺序推断法 - 通过查找前后章节来推断目标章节位置
        
        // 尝试查找上一章(X-1)的内容
        const prevChapterRegex = new RegExp(`第\\s*${chapterNumber - 1}\\s*\\.?\\s*章:?([\\s\\S]*?)(?=\\n*第\\s*\\d+\\s*\\.?\\s*章:|$)`, 'i');
        const prevMatch = outline.match(prevChapterRegex);
        
        // 尝试查找下一章(X+1)的内容
        const nextChapterRegex = new RegExp(`第\\s*${chapterNumber + 1}\\s*\\.?\\s*章:?`, 'i');
        const nextMatch = outline.match(nextChapterRegex);
        
        // 如果能找到上一章和下一章的标记位置
        if (prevMatch && nextMatch && prevMatch.index !== undefined && nextMatch.index !== undefined) {
          
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
              
              // 提取章节标记后的内容
              const markerPosition = possibleChapterContent.indexOf(chapterMarkerInBetween[0]);
              const contentAfterMarker = possibleChapterContent.substring(markerPosition + chapterMarkerInBetween[0].length).trim();
              
              return contentAfterMarker;
            } else {
              // 如果没有章节标记，可能整个内容就是我们要找的章节
              return possibleChapterContent;
            }
          } else {
          }
        } else {
        }
        
        // 如果仍然找不到，尝试按索引查找
        if (chapterNumber <= chapterNumbers.length) {
          return getChapterOutlineByIndex(outline, chapterNumber - 1);
        }
      }
    } else {
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
    return null;
  }
  
  const chapterMarker = matches[index];
  const startPos = outline.indexOf(chapterMarker);
  
  if (startPos === -1) {
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
  } else {
    
    // 尝试匹配任何可能是章节标记的内容
    const looseMatches = outline.match(/第.{0,5}\d+.{0,5}章.{0,3}/g);
    if (looseMatches) {
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
  
  
  // 如果没有找到任何章节编号，尝试使用更宽松的正则表达式
  if (numbers.length === 0) {
    
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
    
  }
  
  return numbers;
};

/**
 * 从完整大纲中提取指定章节之后的所有内容。
 * @param fullOutline - 完整的地块轮廓。
 * @param startChapterIndex - 提取的起始章节号 (例如, 如果我们刚生成了第10章，这个值就是11)。
 * @returns 包含从startChapterIndex开始的所有章节大纲的字符串。
 */
export const extractFutureOutline = (fullOutline: string, startChapterIndex: number): string => {
  // 正则表达式查找 "第X章:"，X是起始章节号。
  // 我们需要查找这个模式第一次出现的位置。
  const regex = new RegExp(`第\\s*${startChapterIndex}\\s*章:`);
  const matchIndex = fullOutline.search(regex);

  if (matchIndex === -1) {
    // 如果没有找到未来的章节，说明已经到了大纲末尾。
    return "";
  }

  // 返回从找到的位置开始到字符串末尾的所有内容。
  return fullOutline.substring(matchIndex).trim();
};

/**
 * 将修正后的未来大纲与原始大纲的未变部分合并。
 * @param originalOutline - 原始的完整大纲。
 * @param revisedFutureOutline - 由"编辑AI"修正过的未来大纲部分。
 * @param startChapterIndex - 未来大纲开始的章节号。
 * @returns 一个新的、完整的、合并后的大纲。
 */
export const combineWithRevisedOutline = (
  originalOutline: string,
  revisedFutureOutline: string,
  startChapterIndex: number
): string => {
  // 查找未来大纲部分在原始大纲中的起始位置。
  const regex = new RegExp(`第\\s*${startChapterIndex}\\s*章:`);
  const separatorIndex = originalOutline.search(regex);

  // 如果找不到分割点，可能意味着我们在大纲的末尾，直接追加。
  // 但更安全的方式是假设调用者逻辑正确，直接返回修正后的大纲，因为它就是全部的未来。
  if (separatorIndex === -1) {
    return revisedFutureOutline.trim();
  }

  // 提取原始大纲中，起始章节之前的所有内容。
  const pastOutlinePart = originalOutline.substring(0, separatorIndex);

  // 将过去的部分和修正后的未来部分拼接起来。
  return `${pastOutlinePart.trim()}\n\n${revisedFutureOutline.trim()}`.trim();
};

/**
 * 从完整的细纲文本中，根据指定的章节范围提取出相应的大纲。
 * @param detailedOutline - 完整的逐章细纲文本。
 * @param range - 一个包含 start 和 end 属性的对象，定义了章节范围。
 * @returns 提取出的大纲文本字符串，如果未找到则为空字符串。
 */
export function getOutlineForChapterRange(
  detailedOutline: string,
  range: { start: number; end: number }
): string {
  if (!detailedOutline || !range) {
    return '';
  }

  const lines = detailedOutline.split('\n');
  const resultLines: string[] = [];
  const chapterRegex = /^\s*第\s*(\d+)\s*章/;

  for (const line of lines) {
    const match = line.match(chapterRegex);
    if (match) {
      const chapterNumber = parseInt(match[1], 10);
      if (chapterNumber >= range.start && chapterNumber <= range.end) {
        resultLines.push(line);
      }
    } else if (resultLines.length > 0) {
      // 如果当前行不是章节标题，但我们已经在目标范围内，则将其视为上一章的延续
      const lastLine = resultLines[resultLines.length - 1];
      const lastMatch = lastLine.match(chapterRegex);
      if(lastMatch) {
          const lastChapterNumber = parseInt(lastMatch[1], 10);
          if (lastChapterNumber >= range.start && lastChapterNumber < range.end) {
              resultLines.push(line);
          }
      }
    }
  }

  return resultLines.join('\n');
} 