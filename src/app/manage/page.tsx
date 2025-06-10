'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
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

export default function ManagePage() {
  const { novels, loading, fetchNovels, deleteNovel } = useNovelStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);

  useEffect(() => {
    fetchNovels();
  }, [fetchNovels]);

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
            Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[260px] w-full rounded-xl" />
            ))
        ) : novels.length > 0 ? (
          novels.map((novel) => (
            <NovelCard
              key={novel.id}
              novel={novel}
              onDelete={handleDeleteRequest}
            />
          ))
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
            <AlertDialogTitle>确定要删除这本小说吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。这将永久删除小说【{selectedNovel?.name}】及其所有章节和内容。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedNovel(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>确定删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 