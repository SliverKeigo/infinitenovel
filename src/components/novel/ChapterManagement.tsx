"use client";

import { useState, useEffect, useCallback } from "react";
import { NovelChapter } from "@prisma/client";
import { ChapterGenerator } from "./ChapterGenerator";
import { ChapterList } from "./ChapterList";
import { ChapterDetail } from "./ChapterDetail";
import { Modal } from "@/components/ui/Modal";

type ChapterManagementProps = {
  novelId: string;
};

interface ChaptersApiResponse {
  chapters: NovelChapter[];
  totalChapters: number;
  totalPages: number;
  currentPage: number;
}

// 現在所有狀態都在一個物件中管理，以防止在快速更新期間出現過時狀態的問題。
type ComponentState = {
  chapters: NovelChapter[];
  totalChapters: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  isLoading: boolean;
  error: string | null;
};

export function ChapterManagement({ novelId }: ChapterManagementProps) {
  const [state, setState] = useState<ComponentState>({
    chapters: [],
    totalChapters: 0,
    totalPages: 1,
    currentPage: 1,
    pageSize: 10,
    isLoading: true,
    error: null,
  });

  const [selectedChapter, setSelectedChapter] = useState<NovelChapter | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchChapters = useCallback(
    async (page: number, size: number) => {
      setState((prevState) => ({ ...prevState, isLoading: true, error: null }));
      try {
        const response = await fetch(
          `/api/novels/${novelId}/chapters?page=${page}&pageSize=${size}`,
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "获取章节失败。");
        }
        const result: ChaptersApiResponse = await response.json();
        setState((prevState) => ({
          ...prevState,
          ...result,
          isLoading: false,
        }));
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "发生了未知错误。";
        setState((prevState) => ({
          ...prevState,
          error: errorMsg,
          isLoading: false,
        }));
      }
    },
    [novelId],
  );

  useEffect(() => {
    fetchChapters(state.currentPage, state.pageSize);
  }, [fetchChapters, state.currentPage, state.pageSize]);

  // 此函數現在對單一狀態物件使用函數式更新，
  // 確保所有計算都基於最新的狀態。
  const handleNewChapter = (newChapter: NovelChapter) => {
    // 透過將狀態更新包裝在 setTimeout 中，我們讓出執行緒給瀏覽器的事件循環。
    // 這會強制 React 立即處理狀態更新並重新渲染，而不是等到 SSE 流關閉後才批次處理。
    // 這是實現在流式傳輸期間即時更新 UI 的關鍵。
    setTimeout(() => {
      setState((prevState) => {
        const newTotalChapters = prevState.totalChapters + 1;
        const newTotalPages = Math.ceil(newTotalChapters / prevState.pageSize);

        if (prevState.currentPage === newTotalPages) {
          return {
            ...prevState,
            chapters: [...prevState.chapters, newChapter],
            totalChapters: newTotalChapters,
            totalPages: newTotalPages,
          };
        }

        return {
          ...prevState,
          totalChapters: newTotalChapters,
          totalPages: newTotalPages,
          currentPage: newTotalPages,
        };
      });
    }, 0);
  };

  const handleChapterSelect = (chapter: NovelChapter) => {
    setSelectedChapter(chapter);
    setIsModalOpen(true);
  };

  const handlePageChange = (page: number) => {
    setState((prevState) => ({ ...prevState, currentPage: page }));
  };

  const handlePageSizeChange = (size: number) => {
    setState((prevState) => ({ ...prevState, pageSize: size, currentPage: 1 }));
  };

  return (
    <>
      <ChapterGenerator
        novelId={novelId}
        onChapterGenerated={handleNewChapter}
      />
      <ChapterList
        chapters={state.chapters}
        totalChapters={state.totalChapters}
        totalPages={state.totalPages}
        currentPage={state.currentPage}
        pageSize={state.pageSize}
        isLoading={state.isLoading}
        error={state.error}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onChapterSelect={handleChapterSelect}
      />
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
