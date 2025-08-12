"use client";

import { NovelChapter } from "@prisma/client";

type ChapterDetailProps = {
  chapter: NovelChapter;
};

export function ChapterDetail({ chapter }: ChapterDetailProps) {
  if (!chapter) {
    return null; // Or some fallback UI
  }

  return (
    <article className="prose prose-invert prose-lg max-w-none p-6 bg-black/20 rounded-b-2xl border-t border-white/20">
      <h1 className="text-3xl font-bold text-white mb-4">{chapter.title}</h1>
      <div
        className="text-slate-300 whitespace-pre-wrap leading-relaxed"
        dangerouslySetInnerHTML={{
          __html: chapter.content.replace(/\\n/g, "<br />"),
        }}
      />
    </article>
  );
}
