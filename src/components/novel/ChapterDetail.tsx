"use client";

import { useState, useEffect } from "react";
import { NovelChapter } from "@prisma/client";
import { Loader2, ServerCrash } from "lucide-react";

type ChapterDetailProps = {
  novelId: string;
  chapterId: string;
};

// --- API 响应的类型定义 ---
// 我们假设有一个API端点可以获取单个章节的完整内容
interface ChapterApiResponse extends NovelChapter {}

export function ChapterDetail({ novelId, chapterId }: ChapterDetailProps) {
  const [chapter, setChapter] = useState<ChapterApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // chapterId 改变时重置状态
    setChapter(null);
    setIsLoading(true);
    setError(null);

    if (!chapterId || !novelId) {
        setIsLoading(false);
        return;
    };

    const fetchChapter = async () => {
      try {
        // 注意：我们假设这个 API 端点存在。如果不存在，后续需要创建。
        const response = await fetch(`/api/novels/${novelId}/chapters/${chapterId}`);
        if (!response.ok) {
          throw new Error("获取章节内容失败。");
        }
        const result: ChapterApiResponse = await response.json();
        setChapter(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "发生了未知错误。");
      } finally {
        setIsLoading(false);
      }
    };

    fetchChapter();
  }, [novelId, chapterId]);

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="animate-spin text-slate-400 inline-block" size={28} />
        <p className="text-slate-400 mt-2">正在加载章节内容...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400">
        <ServerCrash className="inline-block mb-2" size={32} />
        <p>{error}</p>
      </div>
    );
  }

  if (!chapter) {
    return null; // 如果没有章节数据，则不渲染任何内容
  }

  return (
    <article className="prose prose-invert prose-lg max-w-none p-6 bg-black/20 rounded-b-2xl border-t border-white/20">
      <h1 className="text-3xl font-bold text-white mb-4">{chapter.title}</h1>
      <div
        className="text-slate-300 whitespace-pre-wrap leading-relaxed"
        dangerouslySetInnerHTML={{ __html: chapter.content.replace(/\\n/g, '<br />') }}
      />
    </article>
  );
}
