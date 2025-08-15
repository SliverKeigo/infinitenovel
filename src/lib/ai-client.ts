import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParams,
} from "openai/resources/chat/completions";
import { type Stream } from "openai/streaming";
import { ModelConfig } from "@/types/ai";
import { log } from "console";

// --- 统一工具函数 ---

/**
 * 将字符串的异步生成器转换为浏览器兼容的 ReadableStream。
 */
function asyncGeneratorToReadableStream(
  generator: AsyncGenerator<string, void, unknown>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of generator) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

// --- AI 客户端抽象层 ---

type ChatCompletionOptions = {
  temperature?: number;
  max_tokens?: number;
  response_format?: { type?: "text" | "json_object" };
  stream?: boolean;
};

interface AIClient {
  getChatCompletion(
    prompt: string,
    options: ChatCompletionOptions,
  ): Promise<string | ReadableStream<Uint8Array>>;
  getEmbeddings(input: string | string[]): Promise<number[][]>;
}

// --- OpenAI 客户端实现 ---

class OpenAIClient implements AIClient {
  private client: OpenAI;
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: 300 * 1000, // 5分钟超时
    });
  }

  async getChatCompletion(
    prompt: string,
    options: ChatCompletionOptions,
  ): Promise<string | ReadableStream<Uint8Array>> {
    if (!options.stream) {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens,
        response_format:
          options.response_format as ChatCompletionCreateParams["response_format"],
        stream: false,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("AI 返回的响应内容为空。");
      return content.trim();
    } else {
      const streamGenerator = async function* (
        client: OpenAI,
        config: ModelConfig,
        prompt: string,
        options: ChatCompletionOptions,
      ): AsyncGenerator<string, void, unknown> {
        const stream: Stream<ChatCompletionChunk> =
          await client.chat.completions.create({
            model: config.model,
            messages: [{ role: "user", content: prompt }],
            temperature: options.temperature ?? 0.7,
            max_tokens: options.max_tokens,
            response_format:
              options.response_format as ChatCompletionCreateParams["response_format"],
            stream: true,
          });

        for await (const chunk of stream) {
          const chunkContent = chunk.choices[0]?.delta?.content ?? "";
          if (chunkContent) yield chunkContent;
        }
      };
      return asyncGeneratorToReadableStream(
        streamGenerator(this.client, this.config, prompt, options),
      );
    }
  }

  async getEmbeddings(input: string | string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.config.model,
      input: input,
    });
    return response.data.map((item) => item.embedding);
  }
}

// --- Google (Gemini) 客户端实现 (完全代理最终修复版) ---

class GoogleClient implements AIClient {
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
    if (!this.config.baseURL) {
      throw new Error(
        "Google AI 客户端配置不完整，必须提供 baseURL 才能通过代理工作。",
      );
    }
  }

  private getModelName(): string {
    return this.config.model.split("/").pop() || this.config.model;
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": this.config.apiKey,
    };
  }

  async getChatCompletion(
    prompt: string,
    options: ChatCompletionOptions,
  ): Promise<string | ReadableStream<Uint8Array>> {
    const modelName = this.getModelName();
    const headers = this.buildHeaders();
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: options.max_tokens,
        temperature: options.temperature,
        responseMimeType:
          options.response_format?.type === "json_object"
            ? "application/json"
            : "text/plain",
      },
    });

    const endpoint = options.stream
      ? "streamGenerateContent?alt=sse"
      : "generateContent";
    const url = `${this.config.baseURL}/v1beta/models/${modelName}:${endpoint}`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[代理请求] API 请求失败: ${response.status} ${errorBody}`,
      );
    }

    if (options.stream) {
      if (!response.body) {
        throw new Error("流式响应体为空。");
      }
      const sseStream = response.body;
      const transformer = new TransformStream({
        transform(chunk, controller) {
          const decoded = new TextDecoder().decode(chunk);
          const lines = decoded.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const json = JSON.parse(line.substring(6));
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  controller.enqueue(new TextEncoder().encode(text));
                }
              } catch (e) {
                // 忽略不完整的 JSON
              }
            }
          }
        },
      });
      return sseStream.pipeThrough(transformer);
    } else {
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error("AI 返回的响应内容为空。");
      return content.trim();
    }
  }

  async getEmbeddings(input: string | string[]): Promise<number[][]> {
    const modelName = this.getModelName();
    const modelPath = `models/${modelName}`;

    if (Array.isArray(input)) {
      // 为字符串数组处理批量向量请求
      const url = `${this.config.baseURL}/v1beta/${modelPath}:batchEmbedContents`;
      const requests = input.map((text) => ({
        model: modelPath,
        content: { parts: [{ text }] },
      }));

      const response = await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({ requests }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `[代理批量向量请求] API 请求失败: ${response.status} ${errorBody}`,
        );
      }

      const data = await response.json();
      if (!data.embeddings || !Array.isArray(data.embeddings)) {
        throw new Error("批量向量 API 响应格式不正确或为空。");
      }
      return data.embeddings.map((emb: { values: number[] }) => emb.values);
    } else {
      // 为单个字符串处理单一向量请求
      const url = `${this.config.baseURL}/v1beta/${modelPath}:embedContent`;
      const response = await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          content: { parts: [{ text: input }] },
          model: modelPath,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `[代理单一向量请求] API 请求失败: ${response.status} ${errorBody}`,
        );
      }

      const data = await response.json();
      if (!data.embedding?.values) {
        throw new Error("单一向量 API 响应格式不正确或为空。");
      }
      return [data.embedding.values];
    }
  }
}

// --- AI 客户端工厂 ---

class AIClientFactory {
  static createClient(config: ModelConfig): AIClient {
    switch (config.provider) {
      case "openai":
        return new OpenAIClient(config);
      case "google":
        return new GoogleClient(config);
      default:
        throw new Error(`不支持的 AI 提供商: ${config.provider}`);
    }
  }
}

// --- 统一的外部调用函数 ---

async function executeAIRequest<T>(
  task: () => Promise<T>,
  configName: string,
  retries: number,
): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      return await task();
    } catch (error) {
      const isRetryableError =
        (error instanceof OpenAI.APIError &&
          error.status &&
          error.status >= 500 &&
          error.status < 600) ||
        (error instanceof Error &&
          (error.message.includes("内容为空") ||
            error.message.includes("空的流") ||
            error.message.includes("[500]")));

      if (isRetryableError && i < retries - 1) {
        const delay = 5 * 1000;
        console.warn(
          `[AI重试] ${
            error instanceof Error ? error.message : "请求失败"
          }, ${delay / 1000}秒后进行第 ${i + 1} 次尝试...`,
        );
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }

      console.error(`使用模型 [${configName}] 请求 AI 服务时出错:`, error);
      return null;
    }
  }
  return null;
}

export async function getChatCompletion(
  taskDescription: string,
  config: ModelConfig,
  prompt: string,
  options: ChatCompletionOptions = {},
  retries = 30,
): Promise<string | ReadableStream<Uint8Array> | null> {
  log(
    `[AI请求] 任务: ${taskDescription} | 模型配置: ${config.name} (${
      config.provider
    }) | 流式: ${!!options.stream}`,
  );
  const aiClient = AIClientFactory.createClient(config);
  return executeAIRequest(
    () => aiClient.getChatCompletion(prompt, options),
    config.name,
    retries,
  );
}

export async function getEmbeddings(
  config: ModelConfig,
  input: string | string[],
  retries = 30,
): Promise<number[][] | null> {
  log(
    `[Embedding请求] 模型配置: ${config.name} (${config.provider}) | 输入数量: ${
      Array.isArray(input) ? input.length : 1
    }`,
  );
  const aiClient = AIClientFactory.createClient(config);
  return executeAIRequest(
    () => aiClient.getEmbeddings(input),
    config.name,
    retries,
  );
}
