export type ModelType = 'generation' | 'embedding';

export interface ModelConfig {
  id: string;
  name: string;
  type: ModelType;
  baseURL: string;
  apiKey: string;
  model: string;
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
