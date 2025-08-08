import OpenAI from "openai";
import { type Stream } from "openai/streaming";
import { ModelConfig } from "@/types/ai";
import { log } from "console";
import { StreamingTextResponse, streamToResponse } from "ai";

/**
 * 根据提供的模型配置创建一个临时的 OpenAI 客户端。
 * @param config - 包含 baseURL, apiKey 的模型配置。
 * @returns OpenAI 客户端实例。
 */
function createTemporaryClient(config: ModelConfig): OpenAI {
  if (!config.apiKey) {
    throw new Error("模型配置中缺少 API Key。");
  }
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: 300 * 1000, // 5分钟超时
  });
}

/**
 * 将 OpenAI 的响应流转换为浏览器兼容的 ReadableStream。
 * @param stream - 从 OpenAI SDK 返回的流对象。
 * @returns 一个 Uint8Array 格式的 ReadableStream。
 */
async function* openAIStreamToAsyncGenerator(
  stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>,
): AsyncGenerator<string, void, unknown> {
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content ?? "";
    if (content) {
      yield content;
    }
  }
}

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

/**
 * 使用指定的模型配置，获取一个聊天补全（Chat Completion）。
 * 这是与大语言模型交互的核心函数，统一处理流式和非流式请求。
 * @param taskDescription - 一个简短的描述，说明当前 AI 任务的类型（例如，“生成章节内容”、“提取世界观”）。
 * @param config - 当前激活的模型配置。
 * @param prompt - 你想让 AI 执行的任务指令。
 * @param options - 可选的配置项，例如温度、最大 token 数、JSON 格式和流式返回。
 * @returns 根据 stream 选项，返回 AI 生成的文本内容、一个流对象，或者在出错时返回 null。
 */
export async function getChatCompletion(
  taskDescription: string,
  config: ModelConfig,
  prompt: string,
  options: {
    temperature?: number;
    max_tokens?: number;
    response_format?: OpenAI.Chat.Completions.ChatCompletionCreateParams.ResponseFormat;
    stream?: boolean;
  } = {},
  retries = 3,
): Promise<string | ReadableStream<Uint8Array> | null> {
  const aiClient = createTemporaryClient(config);
  log(
    `[AI请求] 任务: ${taskDescription} | 模型配置: ${config.name} | 流式: ${!!options.stream}`,
  );

  for (let i = 0; i < retries; i++) {
    try {
      const response = await aiClient.chat.completions.create({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens,
        response_format: options.response_format,
        stream: options.stream ?? false,
      });

      if (options.stream) {
        const stream =
          response as Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
        const asyncGenerator = openAIStreamToAsyncGenerator(stream);
        return asyncGeneratorToReadableStream(asyncGenerator);
      }

      const content = (response as OpenAI.Chat.Completions.ChatCompletion)
        .choices[0]?.message?.content;

      if (!content) {
        console.warn("AI 返回的响应内容为空。");
        return null;
      }

      return content.trim();
    } catch (error) {
      const is5xxError =
        error instanceof OpenAI.APIError &&
        error.status &&
        error.status >= 500 &&
        error.status < 600;

      if (is5xxError && i < retries - 1) {
        const delay = Math.pow(2, i) * 1000;
        console.warn(
          `AI 服务返回 5xx 错误, ${delay / 1000}秒后进行第 ${i + 1} 次重试...`,
        );
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }

      console.error(`使用模型 [${config.name}] 请求 AI 服务时出错:`, error);
      return null;
    }
  }
  return null;
}

/**
 * 使用指定的模型配置，为一段或多段文本生成向量嵌入（Embeddings）。
 * @param config - 当前激活的向量模型配置。
 * @param input - 需要被向量化的文本或文本数组。
 * @returns 返回一个包含向量数组的数组，如果出错则返回 null。
 */
export async function getEmbeddings(
  config: ModelConfig,
  input: string | string[],
): Promise<number[][] | null> {
  try {
    const aiClient = createTemporaryClient(config);
    const response = await aiClient.embeddings.create({
      model: config.model,
      input: input,
    });
    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.error(`使用模型 [${config.name}] 生成向量时出错:`, error);
    return null;
  }
}
