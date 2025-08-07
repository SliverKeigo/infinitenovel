/**
 * 安全地解析一个可能被 Markdown 代码块包裹的 JSON 字符串。
 * @param text - 可能包含 "```json\n...\n```" 的字符串。
 * @returns 解析后的 JavaScript 对象。
 * @throws 如果清理后的字符串仍然不是有效的 JSON，则会抛出错误。
 */
export function safelyParseJson<T>(text: string): T {
  // Trim whitespace
  const trimmedText = text.trim();
  // Clean markdown code blocks
  const cleanedText = trimmedText.replace(/^```json\s*([\s\S]*?)\s*```$/, "$1");

  try {
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error(
      "Failed to parse cleaned JSON string:",
      cleanedText,
      "Original text:",
      text,
    );
    throw new Error(
      "The provided text could not be parsed as JSON, even after cleaning.",
    );
  }
}
