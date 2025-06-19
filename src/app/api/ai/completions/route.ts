import { NextResponse } from 'next/server';
import { query } from '@/lib/pg-db';
import { AIConfig } from '@/types/ai-config';
import { streamText, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { type CoreMessage, StreamData } from 'ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel-specific config

// 根据ID从数据库获取AI配置的辅助函数
async function getAIConfig(id: number): Promise<AIConfig | null> {
  try {
    const result = await query('SELECT * FROM ai_configs WHERE id = $1', [id]);
    if (result.rows.length > 0) {
      return result.rows[0] as AIConfig;
    }
    return null;
  } catch (error) {
    console.error(`[API Completions] Failed to fetch AI config with id ${id}:`, error);
    return null;
  }
}

export async function POST(req: Request) {
  console.log(`[${new Date().toISOString()}] /api/ai/completions: Request received.`);
  try {
    const body = await req.json();
    const { activeConfigId, stream, ...restOfBody } = body;

    if (!activeConfigId) {
      console.error("[API Completions] 缺少 activeConfigId");
      return NextResponse.json({ error: 'activeConfigId is required' }, { status: 400 });
    }

    const activeConfig = await getAIConfig(activeConfigId);

    if (!activeConfig || !activeConfig.api_key) {
      console.error("[API Completions] AI配置无效或缺少API密钥");
      return NextResponse.json({ error: 'AI configuration not found or API key is missing.' }, { status: 500 });
    }

    const openai = createOpenAI({
      apiKey: activeConfig.api_key,
      baseURL: activeConfig.api_base_url || undefined,
      compatibility: 'compatible',
    });
    
    const model = restOfBody.model || activeConfig.model;

    if (stream) {
      console.log(`[${new Date().toISOString()}] /api/ai/completions: Preparing to call streamText for model ${model}.`);
      const result = streamText({
        model: openai(model),
        messages: restOfBody.messages,
        maxTokens: restOfBody.maxTokens,
        temperature: restOfBody.temperature,
        topP: restOfBody.topP,
        frequencyPenalty: restOfBody.frequencyPenalty,
        presencePenalty: restOfBody.presencePenalty,
        abortSignal: AbortSignal.timeout(300000), // 5 minutes timeout
      });
      console.log(`[${new Date().toISOString()}] /api/ai/completions: streamText call completed, creating response stream.`);
      console.log('result',result.textStream);
      
      
      // 返回一个纯文本流式响应
      return new Response(result.textStream);
    } else {
      const result = await generateText({
        model: openai(model),
        messages: restOfBody.messages,
        temperature: restOfBody.temperature
      });
      return NextResponse.json({
        choices: [{ message: { content: result.text, role: 'assistant' }, finish_reason: result.finishReason }]
      });
    }
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] [API Completions] Caught an error:`, error);
    // 检查错误是否是由于中止操作引起的
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response('Request timed out', { status: 408 }); // Request Timeout
    }
    // 处理其他类型的错误
    const zodError = error instanceof z.ZodError ? error.errors : null;
    const errorMessage =
      zodError?.[0]?.message || (error as Error)?.message || 'Unknown error';
    return new Response(errorMessage, { status: 500 });
  }
} 