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