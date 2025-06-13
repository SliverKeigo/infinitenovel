/**
 * 错误处理相关的工具函数
 */

import { APIError } from 'openai/error';

/**
 * 处理OpenAI API调用中的特定错误，特别是配置错误。
 * @param error - 捕获到的错误对象
 * @throws 如果是可识别的配置错误，则抛出新的、更清晰的错误；否则重新抛出原始错误。
 */
export const handleOpenAIError = (error: any) => {
  if (error instanceof APIError) {
    const responseBody = error.error;
    // 有时代理或错误的URL会返回一个HTML页面，而不是一个API错误
    if (typeof responseBody === 'string' && responseBody.includes('You need to enable JavaScript to run this app')) {
      throw new Error("API请求失败：配置的URL可能是一个Web页面而不是API端点，请检查您的AI配置。");
    }
  }
  // 对于所有其他错误，按原样抛出
  throw error;
}; 