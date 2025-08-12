"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ModelConfig } from "@/types/ai";
import { safelyParseJson } from "@/lib/utils";

type ChapterGeneratorProps = {
  novelId: string;
  onGenerationComplete: () => void;
};

type StoredAiConfig = {
  state: {
    models: ModelConfig[];
    activeGenerationModelId: string;
    activeEmbeddingModelId: string;
  };
};

export function ChapterGenerator({
  novelId,
  onGenerationComplete,
}: ChapterGeneratorProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [generationConfig, setGenerationConfig] = useState<ModelConfig | null>(
    null,
  );
  const [embeddingConfig, setEmbeddingConfig] = useState<ModelConfig | null>(
    null,
  );

  // useEffect for loading config remains the same...
  useEffect(() => {
    try {
      const settingsStr = localStorage.getItem("ai-config-storage");
      const settings = safelyParseJson<StoredAiConfig>(settingsStr, {
        state: {
          models: [],
          activeGenerationModelId: "",
          activeEmbeddingModelId: "",
        },
      });
      const { models, activeGenerationModelId, activeEmbeddingModelId } =
        settings.state || {};
      if (!activeGenerationModelId || !activeEmbeddingModelId) {
        throw new Error(
          "AI 配置未找到。请先在设置页面配置并保存您的 AI 模型信息。",
        );
      }
      const genConfig = models.find((m) => m.id === activeGenerationModelId);
      const embedConfig = models.find((m) => m.id === activeEmbeddingModelId);
      if (!genConfig || !embedConfig) {
        throw new Error("激活的AI模型配置无效。请检查设置页面。");
      }
      setGenerationConfig(genConfig);
      setEmbeddingConfig(embedConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发生未知错误。");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const handleGenerateChapter = async () => {
    if (!generationConfig || !embeddingConfig) {
      setError("AI 配置加载不完整，无法生成章节。");
      return;
    }

    setError(null);
    setStatusMessage("正在准备生成...");
    setIsGenerating(true);

    try {
      const response = await fetch(`/api/novels/${novelId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig,
          embeddingConfig,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`生成失败: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error("响应体为空");
      }

      // Process the Server-Sent Events (SSE) stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messageBoundary = "\n\n";

        while (buffer.includes(messageBoundary)) {
          const messageEndIndex = buffer.indexOf(messageBoundary);
          const message = buffer.substring(0, messageEndIndex);
          buffer = buffer.substring(messageEndIndex + messageBoundary.length);

          if (message.startsWith("data: ")) {
            const jsonStr = message.substring(6).trim();
            if (jsonStr) {
              const data = safelyParseJson(jsonStr as string);
              if (!data) continue;

              if (data.type === "status") {
                setStatusMessage(data.message);
              } else if (data.type === "error") {
                throw new Error(data.message);
              }
            }
          }
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "请求或解析流时发生未知错误";
      setError(`生成章节时出错: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
      setStatusMessage("");
      onGenerationComplete();
    }
  };

  const isLoading = configLoading || isGenerating;
  const buttonText = isGenerating
    ? statusMessage || "AI 正在挥洒创意..."
    : "✨ 生成下一章";

  return (
    <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl">
      <h2 className="text-2xl font-semibold mb-4">创作新章节</h2>

      {configLoading && <p>正在加载 AI 配置...</p>}

      {!configLoading && generationConfig && embeddingConfig && (
        <>
          <button
            onClick={handleGenerateChapter}
            disabled={isLoading}
            className="w-full px-4 py-3 text-lg font-bold text-white bg-white/5 border border-white/20 rounded-lg backdrop-blur-md hover:bg-white/10 disabled:bg-gray-500/10 disabled:cursor-not-allowed transition-all duration-200 ease-in-out relative overflow-hidden group"
          >
            <span className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-sky-500 rounded-lg blur-lg opacity-0 group-hover:opacity-60 group-focus:opacity-70 transition duration-300"></span>
            <span className="relative">{buttonText}</span>
          </button>
        </>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-400 bg-red-900/50 p-3 rounded-md">
          {error}
        </p>
      )}
    </div>
  );
}
