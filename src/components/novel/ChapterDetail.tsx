"use client";

import { NovelChapter } from "@prisma/client";
import { useState } from "react";
import { Clipboard, Check } from "lucide-react";

type ChapterDetailProps = {
  chapter: NovelChapter;
};

export function ChapterDetail({ chapter }: ChapterDetailProps) {
  const [isCopied, setIsCopied] = useState(false);

  if (!chapter) {
    return null; // Or some fallback UI
  }

  const handleCopy = () => {
    // navigator.clipboard is available in secure contexts (HTTPS) and localhost
    navigator.clipboard.writeText(chapter.content).then(
      () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
      },
      (err) => {
        console.error("Could not copy text: ", err);
        // Optionally, provide user feedback about the failure
      },
    );
  };

  return (
    <article className="prose prose-invert prose-lg max-w-none p-6 bg-black/20 rounded-b-2xl border-t border-white/20">
      <div className="flex justify-between items-start">
        <h1 className="text-3xl font-bold text-white mb-4">{chapter.title}</h1>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/20 transition-all text-slate-300 hover:text-white disabled:opacity-50"
          disabled={isCopied}
        >
          {isCopied ? (
            <>
              <Check size={16} className="text-green-400" />
              已复制
            </>
          ) : (
            <>
              <Clipboard size={16} />
              复制内容
            </>
          )}
        </button>
      </div>
      <div
        className="text-slate-300 whitespace-pre-wrap leading-relaxed mt-4"
        dangerouslySetInnerHTML={{
          __html: chapter.content.replace(/\\n/g, "<br />"),
        }}
      />
    </article>
  );
}
