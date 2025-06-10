'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useNovelStore } from '@/store/use-novel-store';
import { Skeleton } from '@/components/ui/skeleton';
import { BasicInfoCard } from '@/components/novel-detail/basic-info-card';
import { CreationStatsCard } from '@/components/novel-detail/creation-stats-card';
import { ChapterManager } from '@/components/novel-detail/chapter-manager';
import { CharacterManager } from '@/components/novel-detail/character-manager';
import { PlotClueManager } from '@/components/novel-detail/plot-clue-manager';
import { KeyStats } from "@/components/novel-detail/key-stats";

export default function NovelDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const {
    currentNovel,
    detailsLoading,
    fetchNovelDetails
  } = useNovelStore();

  useEffect(() => {
    if (id) {
      fetchNovelDetails(id);
    }
  }, [id, fetchNovelDetails]);

  if (detailsLoading) {
    return (
      <div className="container mx-auto py-10 space-y-8">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-4 gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
            <div className="space-y-8">
                <Skeleton className="h-48 w-full" />
            </div>
        </div>
      </div>
    );
  }

  if (!currentNovel) {
    return (
      <div className="container mx-auto py-10 text-center">
        <h1 className="text-2xl font-bold">小说未找到</h1>
        <p className="text-muted-foreground">无法加载该小说的数据，可能已被删除。</p>
      </div>
    );
  }

  return (
      <div className="container mx-auto py-10 space-y-8">
          {/* 页面主标题和统计信息 */}
          <div>
              <h1 className="text-3xl font-bold mb-2">{currentNovel.name}</h1>
              <p className="text-muted-foreground">最后更新于 {new Date(currentNovel.updatedAt).toLocaleString()}</p>
          </div>
          
          <KeyStats />

          {/* 主体布局网格 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* 左侧主栏 */}
              <div className="lg:col-span-2 space-y-8">
                  <BasicInfoCard />
                  <ChapterManager />
              </div>

              {/* 右侧边栏 */}
              <div className="space-y-8">
                  <CreationStatsCard />
                  <CharacterManager />
                  <PlotClueManager />
              </div>
          </div>
      </div>
  );
} 