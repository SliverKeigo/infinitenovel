'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useNovelStore } from '@/store/use-novel-store';
import type { Novel } from '@/types/novel';
import { NovelCard } from '@/components/novel-card';
import { Skeleton } from '@/components/ui/skeleton';

const ITEMS_PER_PAGE = 5;

export default function ManagePage() {
  const { novels, loading, totalNovels, currentPage, pageSize, fetchNovels, deleteNovel } = useNovelStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);

  const totalPages = Math.ceil(totalNovels / pageSize);

  useEffect(() => {
    fetchNovels(currentPage, pageSize);
  }, [fetchNovels, currentPage, pageSize]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchNovels(newPage, pageSize);
    }
  };

  const handleDeleteRequest = (novel: Novel) => {
    setSelectedNovel(novel);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (selectedNovel?.id) {
      deleteNovel(selectedNovel.id);
    }
    setShowDeleteDialog(false);
    setSelectedNovel(null);
  };

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">小说管理</h1>
        <Button asChild>
          <Link href="/create">
            <PlusCircle className="mr-2 h-4 w-4" />
            新建小说
          </Link>
        </Button>
      </div>
      
      <div className="space-y-6">
        {loading ? (
          Array.from({ length: pageSize }).map((_, i) => (
            <Skeleton key={i} className="h-[260px] w-full rounded-xl" />
          ))
        ) : novels.length > 0 ? (
          <>
            {novels.map((novel) => (
              <Link href={`/manage/${novel.id}`} key={novel.id} className="block">
                <NovelCard
                  novel={novel}
                  onDelete={() => handleDeleteRequest(novel)}
                />
              </Link>
            ))}
            {totalPages > 1 && (
              <div className="flex justify-center mt-8">
                <Pagination>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    上一页
                  </Button>
                  <div className="mx-4 flex items-center">
                    第 {currentPage} / {totalPages} 页
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    下一页
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Pagination>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <h3 className="text-2xl font-bold tracking-tight">你还没有创作任何小说</h3>
            <p className="text-sm text-muted-foreground mt-2 mb-4">开始创作，让你的想法变为现实。</p>
            <Button asChild>
              <Link href="/create">
                <PlusCircle className="mr-2 h-4 w-4" />
                开始创作
              </Link>
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              你确定要删除《{selectedNovel?.name}》吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 