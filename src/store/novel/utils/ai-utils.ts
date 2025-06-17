/**
 * AI调用相关的工具函数
 */
import { toast } from "sonner";

/**
 * 延迟指定毫秒数
 * @param ms - 要延迟的毫秒数
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 包装OpenAI的API调用，增加对429错误的自动重试逻辑。
 * @param openaiCall - 一个返回Promise的函数，它执行实际的OpenAI API调用。
 * @param maxRetries - 最大重试次数。默认为1。
 * @param delayMs - 两次重试之间的延迟毫秒数。默认为60000（1分钟）。
 * @returns 返回OpenAI API调用的结果。
 * @throws 如果重试次数用尽或遇到非429错误，则抛出原始错误。
 */
export const callOpenAIWithRetry = async <T>(
  openaiCall: () => Promise<T>,
  maxRetries: number = 1,
  delayMs: number = 60000
): Promise<T> => {
  let attempt = 0;
  while (true) {
    try {
      return await openaiCall();
    } catch (error: any) {
      // 检查是否为429错误且未达到最大重试次数
      if (error.status === 429 && attempt < maxRetries) {
        attempt++;
        const retryMessage = `AI请求过于频繁 (429)，将在 ${delayMs / 1000} 秒后进行第 ${attempt}/${maxRetries} 次重试...`;
        console.warn(`[AI重试] ${retryMessage}`);
        toast.info(retryMessage);
        await sleep(delayMs);
      } else {
        // 如果是其他错误或重试次数已用尽，则抛出错误
        throw error;
      }
    }
  }
};

/**
 * 从API响应中安全地提取文本内容
 * @param response - API响应对象
 * @returns 提取的文本内容
 */
export const extractTextFromAIResponse = (response: any): string => {
  try {
    if (!response?.choices?.[0]?.message?.content) {
      return "";
    }

    let content = response.choices[0].message.content;

    // 处理数组格式的响应
    if (Array.isArray(content)) {
      const textContent = content.find((item: { type: string; text: string }) => item.type === 'text');
      content = textContent?.text || "";
    }

    // 确保 content 是字符串，然后移除 <think> 标签
    if (typeof content === 'string') {
      // 标准化AI响应中的标点符号，防止因全角/半角问题导致解析失败
      content = content.replace(/：/g, ':');
      content = content.replace(/“/g, '"');
      content = content.replace(/”/g, '"');
      return content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    }

    return "";
  } catch (error) {
    console.error('[AI响应处理] 提取文本内容时出错:', error);
    return "";
  }
}; 