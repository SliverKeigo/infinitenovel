import OpenAI from "openai";
import { useAiConfigStore } from "@/hooks/useAiConfigStore";
import { ModelConfig } from "@/types/ai";

class DynamicOpenAIClient {
  private openai: OpenAI | null = null;
  private modelConfig: ModelConfig | null = null;
  private static instance: DynamicOpenAIClient;

  // Private constructor to prevent direct instantiation
  private constructor() {
    this.setup();
  }

  // Singleton instance getter
  public static getInstance(): DynamicOpenAIClient {
    if (!DynamicOpenAIClient.instance) {
      DynamicOpenAIClient.instance = new DynamicOpenAIClient();
    }
    return DynamicOpenAIClient.instance;
  }

  // Initialize and subscribe to store changes
  private setup() {
    // Initial setup
    const initialConfig = useAiConfigStore
      .getState()
      .getActiveGenerationModel();
    if (initialConfig) {
      this.initialize(initialConfig);
    }

    // Subscribe to future changes
    useAiConfigStore.subscribe(
      (state) => state.activeGenerationModelId,
      () => {
        const newConfig = useAiConfigStore
          .getState()
          .getActiveGenerationModel();
        if (newConfig) {
          this.initialize(newConfig);
        } else {
          this.openai = null;
          this.modelConfig = null;
        }
      },
    );
  }

  private initialize(config: ModelConfig) {
    this.modelConfig = config;
    this.openai = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  public getClient(): OpenAI {
    if (!this.openai) {
      throw new Error(
        "OpenAI client is not initialized. Please select an active generation model in settings.",
      );
    }
    return this.openai;
  }

  public getModelName(): string {
    if (!this.modelConfig) {
      throw new Error("No active generation model selected.");
    }
    return this.modelConfig.model;
  }
}

export const aiClient = DynamicOpenAIClient.getInstance();
