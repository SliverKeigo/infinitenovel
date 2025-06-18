import { NextResponse } from 'next/server';
import { query } from '@/lib/pg-db';
import { AIConfig } from '@/types/ai-config';
import { streamText, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

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

    // 使用从数据库获取的配置创建OpenAI provider
    const openai = createOpenAI({
      apiKey: activeConfig.api_key,
      baseURL: activeConfig.api_base_url || undefined,
    });
    
    const model = restOfBody.model || activeConfig.model;

    // 根据 stream 参数决定响应类型
    if (stream) {
      const result = await streamText({
        model: openai(model),
        messages: restOfBody.messages,
        temperature: restOfBody.temperature,
        maxTokens: 8192,
      });
      
      // 返回一个纯文本流式响应
      return new Response(result.textStream);

    } else {
      // For non-streaming, we use generateText for consistency.
      const result = await generateText({
        model: openai(model),
        messages: restOfBody.messages,
        temperature: restOfBody.temperature,
        maxTokens: 8192,
      });

      // The AI SDK's generateText returns a specific structure.
      // We might need to adapt this if the client expects the raw OpenAI response.
      // For now, we'll return the text content.
      // To return a similar structure to the original, you might do:
      return NextResponse.json({
        choices: [{ message: { content: result.text, role: 'assistant' }, finish_reason: result.finishReason }]
      });
    }
  } catch (error: any) {
    console.error('[API Completions] Error:', error);
    // The AI SDK might throw its own specific errors, but OpenAI.APIError will no longer be relevant here
    // if the raw client isn't used.
    if (error.name === 'APIError') { // A generic way to check for API errors from the SDK
      return new NextResponse(error.message, { status: error.status });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 