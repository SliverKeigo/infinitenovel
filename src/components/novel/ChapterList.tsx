"use client";

import { NovelChapter } from "@prisma/client";
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BookOpen,
} from "lucide-react";


// 这是一个纯粹的展示组件，负责渲染章节列表和分页控件
export function ChapterList({
  chapters,
  totalPages,
  currentPage,
  pageSize,
  isLoading,
  error,
  onPageChange,
  onPageSizeChange,
  onChapterSelect,
}: {
  chapters: NovelChapter[];
  totalPages: number;
  currentPage: number;
  pageSize: number;
  isLoading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onChapterSelect: (chapter: NovelChapter) => void;
}) {
  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onPageSizeChange(Number(e.target.value));
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold flex items-center gap-3">
          <FileText className="text-blue-400" />
          章节列表
        </h2>
        {/* Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="pageSize" className="text-sm text-slate-300">
              每页显示:
            </label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={handlePageSizeChange}
              className="bg-black/20 text-white border-none rounded-lg px-3 py-1.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span>
              第 {currentPage} / {totalPages || 1} 页
            </span>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages || isLoading}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-[200px] relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="animate-spin text-slate-400" size={32} />
          </div>
        ) : error ? (
          <div className="text-red-400 text-center py-8">{error}</div>
        ) : chapters.length > 0 ? (
          <ul className="space-y-2">
            {chapters.map((chapter) => (
              <li
                key={chapter.id}
                onClick={() => onChapterSelect(chapter)}
                className="text-slate-300 hover:text-white transition-colors duration-200 cursor-pointer p-3 rounded-lg hover:bg-white/5 flex justify-between items-center"
              >
                <span>
                  <span className="font-semibold text-slate-100">
                    第 {chapter.chapterNumber} 章:{" "}
                  </span>
                  {chapter.title}
                </span>
                <BookOpen
                  size={18}
                  className="text-slate-500 hover:text-white"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400 text-center py-8">还没有任何章节。</p>
        )}
      </div>
    </div>
  );
}
