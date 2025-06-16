'use client';

import type { Novel } from '@/types/novel';
import { format, formatDistanceToNow, isAfter, subHours } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
  BookText,
  Clock,
  Eye,
  MoreVertical,
  PlayCircle,
  Users,
  BarChart3,
  Trash2,
} from 'lucide-react';
import { useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { useRouter } from 'next/navigation';

interface NovelCardProps {
  novel: Novel;
  onDelete: (novel: Novel, e: React.MouseEvent<Element, MouseEvent>) => void;
}

export function NovelCard({ novel, onDelete }: NovelCardProps) {
  const formatUpdatedAt = (updatedAt: Date) => {
    const now = new Date();
    const threshold = subHours(now, 72);
    return isAfter(updatedAt, threshold)
      ? `${formatDistanceToNow(updatedAt, { locale: zhCN })}前`
      : format(updatedAt, 'yyyy-MM-dd', { locale: zhCN });
  };

  const router = useRouter();

  const wordsPerChapter =
    novel.chapter_count > 0
      ? Math.round(novel.word_count / novel.chapter_count)
      : 0;

  const progressValue =
    novel.total_chapter_goal > 0
      ? (novel.chapter_count / novel.total_chapter_goal) * 100
      : 0;

  const handleViewClick = useCallback((e: React.MouseEvent<Element, MouseEvent>) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/manage/${novel.id}`);
  }, [novel.id, router]);

  const handleDeleteClick = useCallback((e: React.MouseEvent<Element, MouseEvent>) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(novel, e);
  }, [novel, onDelete]);

  const handleDropdownTriggerClick = useCallback((e: React.MouseEvent<Element, MouseEvent>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleCardClick = useCallback((e: React.MouseEvent<Element, MouseEvent>) => {
    e.stopPropagation();
  }, []);

  return (
    <Card onClick={handleCardClick}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">{novel.name}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="default">{novel.genre}</Badge>
            <Badge variant="secondary">{novel.style}</Badge>
            <span>创建于 {format(novel.created_at, 'yyyy/M/d')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleViewClick}>
            <Eye className="mr-2 h-4 w-4" />
            查看
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleDropdownTriggerClick}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={handleCardClick}>
              <DropdownMenuLabel>更多操作</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-500"
                onClick={handleDeleteClick}
                onSelect={(e) => {
                  e.preventDefault();
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>删除</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-4 divide-x rounded-lg border bg-muted/50 p-4 text-sm">
        <div className="flex flex-col items-center gap-1">
          <BookText className="h-5 w-5 text-muted-foreground" />
          <span>{novel.word_count.toLocaleString()}字</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span>{novel.character_count}个人物</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <span>{wordsPerChapter.toLocaleString()}字/章</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <span>{formatUpdatedAt(novel.updated_at)}</span>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 pt-6">
        <div className="flex w-full justify-between text-sm text-muted-foreground">
          <span>进度</span>
          <span>
            {novel.chapter_count}/{novel.total_chapter_goal} 章
          </span>
        </div>
        <Progress value={progressValue} aria-label={`${progressValue.toFixed(0)}% complete`} />
      </CardFooter>
    </Card>
  );
} 