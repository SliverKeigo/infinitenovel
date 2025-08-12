"use client";

import { useState, useEffect } from "react";
import { NovelChapter } from "@prisma/client";
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BookOpen,
} from "lucide-react";
import { ChapterDetail } from "./ChapterDetail";
import { Modal } from "@/components/ui/Modal";

type ChapterListProps = {
  novelId: string;
};

interface ChaptersApiResponse {
  chapters: NovelChapter[];
  totalChapters: number;
  totalPages: number;
  currentPage: number;
}

export function ChapterList({ novelId }: ChapterListProps) {
  const [data, setData] = useState<ChaptersApiResponse | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<NovelChapter | null>(
    null,
  );

  useEffect(() => {
    const fetchChapters = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/novels/${novelId}/chapters?page=${currentPage}&pageSize=${pageSize}`,
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "获取章节失败。");
        }
        const result: ChaptersApiResponse = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "发生了未知错误。");
      } finally {
        setIsLoading(false);
      }
    };

    if (novelId) {
      fetchChapters();
    }
  }, [novelId, currentPage, pageSize]);

  const handleChapterClick = (chapter: NovelChapter) => {
    setSelectedChapter(chapter);
    setIsModalOpen(true);
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value));
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    if (data && page >= 1 && page <= data.totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <>
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
                第 {currentPage} / {data?.totalPages || 1} 页
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
                disabled={!data || currentPage === data.totalPages || isLoading}
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
          ) : data && data.chapters.length > 0 ? (
            <ul className="space-y-2">
              {data.chapters.map((chapter) => (
                <li
                  key={chapter.id}
                  onClick={() => handleChapterClick(chapter)}
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

      {/* Modal for Chapter Detail */}
      {selectedChapter && (
        <Modal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          title={
            <>
              <span className="font-light">
                第 {selectedChapter.chapterNumber} 章:
              </span>{" "}
              {selectedChapter.title}
            </>
          }
        >
          <ChapterDetail chapter={selectedChapter} />
        </Modal>
      )}
    </>
  );
}
