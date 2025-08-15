"use client";

import { useState, useEffect, useCallback } from "react";
import { NovelChapter } from "@prisma/client";
import { ChapterGenerator } from "./ChapterGenerator";
import { ChapterList } from "./ChapterList";
import { ChapterDetail } from "./ChapterDetail";
import { Modal } from "@/components/ui/modal";

type ChapterManagementProps = {
  novelId: string;
};

interface ChaptersApiResponse {
  chapters: NovelChapter[];
  totalChapters: number;
  totalPages: number;
  currentPage: number;
}

// 统一管理组件的所有状态，以避免在快速更新期间因状态闭包导致数据不一致。
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

  // 用于存储和管理模态框中选中的章节详情。
  const [selectedChapter, setSelectedChapter] = useState<NovelChapter | null>(
    null,
  );
  // 控制章节详情模态框的显示和隐藏。
  const [isModalOpen, setIsModalOpen] = useState(false);

  /**
   * 异步函数，用于从后端 API 获取指定页码和大小的章节列表。
   * 使用 useCallback 进行性能优化，仅在 novelId 变化时重新创建。
   */
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

  // Effect hook，用于在组件挂载或分页状态（页码、页面大小）变化时获取章节数据。
  useEffect(() => {
    fetchChapters(state.currentPage, state.pageSize);
  }, [fetchChapters, state.currentPage, state.pageSize]);

  /**
   * 处理新章节生成后的回调函数。
   * 它会计算新的总章节数和总页数，并自动跳转到最后一页以显示最新生成的章节。
   * @param newChapter - 新生成的章节对象。
   */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleNewChapter = (_newChapter: NovelChapter) => {
    setState((prevState) => {
      const newTotalChapters = prevState.totalChapters + 1;
      const newTotalPages = Math.ceil(newTotalChapters / prevState.pageSize);
      const newCurrentPage = newTotalPages;

      // 仅更新分页状态，useEffect 会自动触发数据的重新获取。
      return {
        ...prevState,
        totalChapters: newTotalChapters,
        totalPages: newTotalPages,
        currentPage: newCurrentPage,
      };
    });
  };

  /**
   * 处理用户在列表中选择一个章节的事件。
   * @param chapter - 被选中的章节对象。
   */
  const handleChapterSelect = (chapter: NovelChapter) => {
    setSelectedChapter(chapter);
    setIsModalOpen(true);
  };

  /**
   * 处理用户点击分页组件切换页码的事件。
   * @param page - 新的页码。
   */
  const handlePageChange = (page: number) => {
    setState((prevState) => ({ ...prevState, currentPage: page }));
  };

  /**
   * 处理用户更改每页显示数量的事件。
   * @param size - 新的页面大小。
   */
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
