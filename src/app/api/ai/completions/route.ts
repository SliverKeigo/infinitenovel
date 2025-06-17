import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { query } from '@/lib/pg-db';
import { AIConfig } from '@/types/ai-config';

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

    const openai = new OpenAI({
      apiKey: activeConfig.api_key,
      baseURL: activeConfig.api_base_url || undefined,
    });
    
    const model = restOfBody.model || activeConfig.model;

    // 根据 stream 参数决定响应类型
    if (stream) {
      const responseStream = await openai.chat.completions.create({
        ...restOfBody,
        model: model,
        stream: true,
        timeout: 300000, // 300秒超时
        max_retries: 2, // 最多重试2次
      });    
      // 将OpenAI的流转换为Web标准的ReadableStream
      const webReadableStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const chunk of responseStream as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
              const data = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
            // 正常结束时发送 [DONE] 标记
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (err) {
            console.error('[API Completions] Stream error:', err instanceof Error ? err.message : err);
            controller.error(err as any);
          }
        },
      });

      return new Response(webReadableStream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
      });

    } else {
      const response = await openai.chat.completions.create({
        ...restOfBody,
        model: model,
        stream: false,
        timeout: 300000, // 300秒超时
        max_retries: 2, // 最多重试2次
      });
      return NextResponse.json(response);
    }
  } catch (error) {
    console.error('[API Completions] Error:', error);
    if (error instanceof OpenAI.APIError) {
      console.error('[API Completions] OpenAI API Error:', {
        status: error.status,
        message: error.message,
        code: error.code,
        type: error.type
      });
      return new NextResponse(error.message, { status: error.status });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 