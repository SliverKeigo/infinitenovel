/**
 * 安全地解析一个可能被 Markdown 代码块包裹的 JSON 字符串。
 * @param text - 可能包含 "```json\n...\n```" 的字符串。
 * @returns 解析后的 JavaScript 对象。
 * @throws 如果清理后的字符串仍然不是有效的 JSON，则会抛出错误。
 */
export function safelyParseJson<T>(text: string): T | null {
  // 修剪空白字符
  const trimmedText = text.trim();

  // 如果字符串为空或仅包含空白，则返回 null
  if (!trimmedText) {
    return null;
  }

  // 清理 markdown 代码块
  const cleanedText = trimmedText.replace(/^```json\s*([\s\S]*?)\s*```$/, "$1");

  // 如果清理后的字符串为空，则返回 null
  if (!cleanedText) {
    return null;
  }

  try {
    return JSON.parse(cleanedText);
  } catch {
    console.error(
      "解析清理后的 JSON 字符串失败:",
      cleanedText,
      "原始文本:",
      text,
    );
    throw new Error(
      "提供的文本在清理后仍然无法解析为 JSON。",
    );
  }
}
