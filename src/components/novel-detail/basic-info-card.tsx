'use client';

import { useNovelStore } from '@/store/use-novel-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, Book, Feather, Target, Calendar, Tag } from 'lucide-react';
import { format } from 'date-fns';

export const BasicInfoCard = () => {
  const currentNovel = useNovelStore((state) => state.currentNovel);

  if (!currentNovel) return null;
  
  const getStatusBadge = (status: number, goal: number) => {
    if (status >= goal) return <Badge variant="success">已完结</Badge>;
    return <Badge variant="secondary">生成中</Badge>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5 text-primary" />
          <span>基本信息</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-6 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">小说标题</span>
          <span className="font-semibold">{currentNovel.name}</span>
        </div>
        <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">题材类型</span>
            <div className="flex items-center gap-2">
                <Badge>{currentNovel.genre}</Badge>
            </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">写作风格</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{currentNovel.style}</Badge>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">创建时间</span>
          <span className="font-semibold">{format(currentNovel.createdAt, 'yyyy/MM/dd HH:mm')}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">目标章节</span>
          <span className="font-semibold">{currentNovel.totalChapterGoal ?? 0} 章</span>
        </div>
         <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">当前状态</span>
          <div className="font-semibold">
              {getStatusBadge(currentNovel.chapterCount, currentNovel.totalChapterGoal)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
