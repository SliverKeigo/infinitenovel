/**
 * 安全地解析一个可能被 Markdown 代码块包裹的 JSON 字符串。
 * @param text - 可能包含 "```json\n...\n```" 的字符串。
 * @returns 解析后的 JavaScript 对象。
 * @throws 如果清理后的字符串仍然不是有效的 JSON，则会抛出错误。
 */
export function safelyParseJson<T>(text: string): T {
  // 使用正则表达式安全地移除潜在的 markdown 代码块
  // \s* 匹配可能存在的前后空格或换行符
  const cleanedText = text.replace(/^```json\s*([\s\S]*?)\s*```$/, "$1");

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

export async function readStreamToString(
  stream: ReadableStream,
): Promise<string> {
  let result = "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    result += decoder.decode(value, { stream: true });
  }

  return result;
}
