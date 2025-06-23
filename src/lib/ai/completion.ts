import { type AIConfig } from '@/types/ai-config';
import { streamText, generateText, type CoreMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

interface CompletionParams {
  model: string;
  messages: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

/**
 * 直接调用AI SDK生成文本补全。
 * @param params - AI调用的参数，如模型、消息等。
 * @param activeConfig - 激活的AI配置，包含API Key和Base URL。
 * @param stream - 是否以流式方式返回。
 * @returns 如果是流式，返回Response对象；如果不是，返回包含生成文本的JSON对象。
 * @throws 如果配置无效或AI调用失败，则抛出错误。
 */
export async function createAICompletion(
  params: CompletionParams,
  activeConfig: AIConfig,
  stream: boolean = false
) {
  if (!activeConfig || !activeConfig.api_key) {
    throw new Error("AI configuration not found or API key is missing.");
  }

  const openai = createOpenAI({
    apiKey: activeConfig.api_key,
    baseURL: activeConfig.api_base_url || undefined,
    compatibility: 'compatible',
  });

  const model = params.model || activeConfig.model;

  try {
    if (stream) {
      const result = await streamText({
        model: openai(model),
        messages: params.messages,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        topP: params.topP,
        frequencyPenalty: params.frequencyPenalty,
        presencePenalty: params.presencePenalty,
        abortSignal: AbortSignal.timeout(300000), // 5 minutes timeout
      });
      return result.textStream;
    } else {
      const result = await generateText({
        model: openai(model),
        messages: params.messages,
        temperature: params.temperature,
      });
      return {
        choices: [{ message: { content: result.text, role: 'assistant' }, finish_reason: result.finishReason }]
      };
    }
  } catch (error: any) {
    console.error(`[AI Completion Lib] Caught an error:`, error);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error("Request timed out");
    }
    const zodError = error instanceof z.ZodError ? error.errors : null;
    const errorMessage =
      zodError?.[0]?.message || (error as Error)?.message || 'Unknown error';
    throw new Error(errorMessage);
  }
} 