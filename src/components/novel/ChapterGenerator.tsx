"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ModelConfig } from "@/types/ai";
import { safelyParseJson } from "@/lib/utils";

type ChapterGeneratorProps = {
  novelId: string;
};

export function ChapterGenerator({ novelId }: ChapterGeneratorProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
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
      const settings = safelyParseJson<any>(settingsStr, {});
      const { models, activeGenerationModelId, activeEmbeddingModelId } =
        settings.state || {};
      if (!activeGenerationModelId || !activeEmbeddingModelId) {
        throw new Error(
          "AI 配置未找到。请先在设置页面配置并保存您的 AI 模型信息。",
        );
      }
      const genConfig = models.find(
        (m: any) => m.id === activeGenerationModelId,
      );
      const embedConfig = models.find(
        (m: any) => m.id === activeEmbeddingModelId,
      );
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
    setStreamingContent("");
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
        const lines = buffer.split("");

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line.startsWith("data: ")) {
            const jsonStr = line.substring(6);
            const data = JSON.parse(jsonStr);
            if (data.type === "status") {
              setStatusMessage(data.message);
            } else if (data.type === "content") {
              setStreamingContent((prev) => prev + data.chunk);
            } else if (data.type === "error") {
              throw new Error(data.message);
            }
          }
        }
        buffer = lines[lines.length - 1];
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "请求或解析流时发生未知错误";
      setError(`生成章节时出错: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
      setStatusMessage("");
      router.refresh();
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

          {isGenerating && (
            <div className="mt-4 p-4 bg-black/20 rounded-lg max-h-60 overflow-y-auto">
              {statusMessage && !streamingContent && (
                <p className="text-gray-400 font-mono">{statusMessage}</p>
              )}
              {streamingContent && (
                <p className="text-white whitespace-pre-wrap font-mono">
                  {streamingContent}
                </p>
              )}
            </div>
          )}
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
