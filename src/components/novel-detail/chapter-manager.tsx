'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useNovelStore } from '@/store/use-novel-store';
import { useRouter } from 'next/navigation';
import { toast } from "sonner";
import { Chapter } from '@/types/chapter';
import { useAppStatusStore, ModelLoadStatus } from '@/store/use-app-status-store';
import { 
  AlertCircle, RefreshCw, BookMarked, PlusCircle, Loader2, 
  ArrowUpNarrowWide, ArrowDownWideNarrow, Search, ChevronsDown, 
  ChevronsUp, BookOpen, ChevronLeft, ChevronRight, BookUp
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExpansionControlCenter } from '../novel-detail/expansion-control-center';
import { ChapterViewer } from '../novel-detail/chapter-viewer';
import { set } from 'date-fns';

// 定义每页显示的章节数量
const ITEMS_PER_PAGE = 10;

export function ChapterManager() {
    const { 
        chapters, 
        currentNovel, 
        buildNovelIndex, 
        indexLoading, 
        currentNovelIndex,
        generationLoading,
        generationTask,
        updateNovelStats,
    publishChapter,
    } = useNovelStore();
  const { embeddingModelStatus, embeddingModelProgress } = useAppStatusStore();
  const router = useRouter();
    
  // 原始组件的状态
    const [showControlCenter, setShowControlCenter] = useState(false);
    const [viewingChapter, setViewingChapter] = useState<Chapter | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    const [syncing, setSyncing] = useState(false);
  
  // 新组件的状态
  const [nonCompliantChapters, setNonCompliantChapters] = useState<Chapter[]>([]);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishingChapter, setPublishingChapter] = useState<Chapter | null>(null);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');

    const isEmbeddingModelReady = embeddingModelStatus === ModelLoadStatus.LOADED;
    const isEmbeddingModelLoading = embeddingModelStatus === ModelLoadStatus.LOADING;
    const isAnythingLoading = indexLoading || isEmbeddingModelLoading;

  // 过滤和排序章节
  const filteredAndSortedChapters = useMemo(() => {
    return chapters
      .filter(chapter => 
        chapter.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          `第 ${chapter.chapter_number} 章`.includes(searchTerm)
      )
      .filter(chapter => 
        statusFilter === 'all' || 
        (statusFilter === 'draft' && !chapter.is_published) ||
        (statusFilter === 'published' && chapter.is_published)
      )
      .sort((a, b) => {
        if (sortOrder === 'asc') {
          return a.chapter_number - b.chapter_number;
        }
        return b.chapter_number - a.chapter_number;
      });
  }, [chapters, searchTerm, sortOrder, statusFilter]);
  
  // 计算总页数
  const totalPages = useMemo(() => {
    return Math.ceil(filteredAndSortedChapters.length / ITEMS_PER_PAGE);
  }, [filteredAndSortedChapters]);
  
  // 获取当前页的章节
  const currentPageChapters = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedChapters.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedChapters, currentPage]);

  // 控制中心相关功能
    const handleToggleControlCenter = () => {
        const novelId = currentNovel?.id;
        if (!novelId) return;

        if (!currentNovelIndex && !isAnythingLoading) {
            buildNovelIndex(novelId, () => {
                setShowControlCenter(true);
            });
            return;
        }

        setShowControlCenter(prev => !prev);
    };

    const handleSyncStats = async () => {
        if (!currentNovel?.id) return;
        setSyncing(true);
        toast.info("正在从数据库同步最新统计数据...");
        try {
            await updateNovelStats(currentNovel.id);
            toast.success("统计数据同步完成！");
        } catch (error) {
            toast.error("同步失败，请检查控制台获取更多信息。");
            console.error("Failed to sync novel stats:", error);
        } finally {
            setSyncing(false);
        }
    };

    const getDisplayStep = (step: string): string => {
        if (step && step.includes('场景')) {
          const chapterPart = step.split(' - ')[0];
          if (chapterPart) {
            return `${chapterPart}...`;
          }
        }
        return step;
    };

  // 合规性检查相关功能
  const isNonCompliant = (chapterId: number) => {
    return nonCompliantChapters.some(chapter => chapter.id === chapterId);
  };



  // 显示不符合规划的详细信息
  const handleShowNonCompliantDetails = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setDialogOpen(true);
  };

  // 处理章节点击，设置要查看的章节
  const handleChapterClick = (chapterId: number) => {
    const chapter = chapters.find(ch => ch.id === chapterId);
    if (chapter) {
      setViewingChapter(chapter);
    } else {
      toast.error("未找到章节内容");
    }
  };
  
  // 处理页面变化
  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };
  
  // 当过滤条件改变时，重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortOrder, statusFilter]);
  
  // 当章节列表变化时，检查当前页是否有效
  useEffect(() => {
    if (chapters.length > 0 && (currentPage - 1) * ITEMS_PER_PAGE >= chapters.length) {
      setCurrentPage(Math.max(1, Math.ceil(chapters.length / ITEMS_PER_PAGE)));
    }
  }, [chapters.length, currentPage]);

  // 如果没有章节，显示提示信息
  if (chapters.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted p-12 text-center">
            <div className="mb-4 rounded-full bg-secondary p-4">
              <BookMarked className="h-12 w-12 text-secondary-foreground" />
            </div>
            <h3 className="text-xl font-bold tracking-tight">还没有章节</h3>
            <p className="text-sm text-muted-foreground mt-2 mb-4">准备好开始创作你的第一章了吗？</p>
            <Button 
              onClick={handleToggleControlCenter}
              disabled={isAnythingLoading || (generationLoading && generationTask.isActive)}
            >
              {isEmbeddingModelLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>知识引擎加载中...</span>
                </>
              ) : (indexLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>构建索引中...</span>
                </>
              ) : (generationLoading && generationTask.isActive) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>{getDisplayStep(generationTask.currentStep) || '续写中...'}</span>
                </>
              ) : '生成第一章')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
            <CardHeader>
                <div className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        <span>章节管理</span>
                    </CardTitle>
          <div className="flex gap-2">
            
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleToggleControlCenter}
              disabled={isAnythingLoading || (generationLoading && generationTask.isActive)}
                    >
                        {isEmbeddingModelLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                <span>知识引擎 ({(embeddingModelProgress || 0).toFixed(0)}%)</span>
                            </>
                        ) : indexLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                <span>构建索引...</span>
                            </>
                        ) : (generationLoading && generationTask.isActive) ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                <span>{getDisplayStep(generationTask.currentStep) || '续写中...'}</span>
                            </>
                        ) : (
                        <>
                            {showControlCenter ? <ChevronsUp className="mr-2 h-4 w-4" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                            {showControlCenter ? '收起面板' : (currentNovelIndex ? '生成下一章' : '准备创作引擎')}
                        </>
                        )}
                    </Button>
                    <Button onClick={handleSyncStats} disabled={syncing} size="sm" variant="ghost">
                        {syncing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        同步统计
                    </Button>
          </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                    <div className="relative flex-grow">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="搜索章节标题或序号..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <Button variant="outline" size="icon" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
                        {sortOrder === 'asc' ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
                    </Button>
                </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">筛选:</span>
          <Button size="sm" variant={statusFilter === 'all' ? 'secondary' : 'ghost'} onClick={() => setStatusFilter('all')}>全部</Button>
          <Button size="sm" variant={statusFilter === 'draft' ? 'secondary' : 'ghost'} onClick={() => setStatusFilter('draft')}>草稿</Button>
          <Button size="sm" variant={statusFilter === 'published' ? 'secondary' : 'ghost'} onClick={() => setStatusFilter('published')}>已发布</Button>
        </div>
            </CardHeader>
            <CardContent>
                {showControlCenter && <ExpansionControlCenter onClose={() => setShowControlCenter(false)} />}
                
                {filteredAndSortedChapters.length === 0 && !showControlCenter && !generationLoading ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted p-12 text-center">
                                <Search className="h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-4 text-xl font-bold tracking-tight">未找到匹配的章节</h3>
                                <p className="text-sm text-muted-foreground mt-2">请尝试使用其他关键词进行搜索。</p>
          </div>
                        ) : (
          <div className="space-y-2">
            {currentPageChapters.map((chapter) => {
              // 确保chapter.id是number类型
              const chapterId = chapter.id;
              if (typeof chapterId !== 'number') return null;
              
              return (
                <div 
                  key={chapterId} 
                  className={`flex items-center justify-between p-3 rounded-md cursor-pointer hover:bg-accent ${
                    isNonCompliant(chapterId) ? 'border-l-4 border-destructive' : ''
                  }`}
                  onClick={() => setViewingChapter(chapter)}
                >
                  <div className="flex items-center">
                    <span className="text-sm font-medium mr-2">第 {chapter.chapter_number} 章</span>
                    <span>{chapter.title}</span>
                    {isNonCompliant(chapterId) && (
                      <Badge variant="destructive" className="ml-2">
                        不符合宏观规划
                      </Badge>
                        )}
                    </div>
                  <div className="flex items-center space-x-2">
                    {!chapter.is_published ? (
                      <Badge variant="secondary" className="font-normal border-yellow-500/50 text-yellow-600">草稿</Badge>
                    ) : (
                      <Badge variant="default" className="font-normal bg-green-100 text-green-700">已发布</Badge>
                    )}
                    <Badge variant="outline" className="font-normal">{chapter.word_count.toLocaleString()}字</Badge>
                    {isNonCompliant(chapterId) && (
                      <Button
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPublishingChapter(chapter);
                          setDialogOpen(true);
                        }}
                      >
                        <AlertCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {!chapter.is_published && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPublishingChapter(chapter);
                          setIsPublishing(true);
                        }}
                      >
                        <BookUp className="h-4 w-4 mr-1" />
                        发布
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingChapter(chapter);
                      }}
                    >
                      查看
                    </Button>
                  </div>
                </div>
              );
            })}
                                </div>
        )}
        
        {/* 分页控件 */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-4">
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
            </CardContent>
      
      {/* 发布确认对话框 */}
      <Dialog open={isPublishing} onOpenChange={(open) => {
        if (!open) {
          setIsPublishing(false);
          setPublishingChapter(null);
        } else {
          setIsPublishing(open);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认发布章节</DialogTitle>
            <DialogDescription>
              您确定要发布第 {publishingChapter?.chapter_number} 章 "{publishingChapter?.title}" 吗？
              <br />
              发布后将不能再编辑。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsPublishing(false);
                setPublishingChapter(null);
              }}
            >
              取消
            </Button>
            <Button
              onClick={async () => {
                if (!publishingChapter?.id) {
                  toast.error("无法获取章节信息");
                  return;
                }
                try {
                  await publishChapter(publishingChapter.id);
                  toast.success("章节发布成功！");
                  setIsPublishing(false);
                  setPublishingChapter(null);
                } catch (error) {
                  toast.error(`发布失败: ${error instanceof Error ? error.message : '未知错误'}`);
                }
              }}
            >
              确认发布
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 不符合规划详情对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>宏观叙事规划检查结果</DialogTitle>
            <DialogDescription>
              {selectedChapter && nonCompliantChapters.find(ch => ch.id === selectedChapter.id)?.title.split('[不符合规划:')[1]?.replace(']', '')}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            在生成下一章时，请注意上述问题，确保章节内容符合当前阶段的规划要求，不要过早引入后续阶段的元素。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 章节查看器 */}
            <ChapterViewer
              chapter={viewingChapter}
              onClose={() => setViewingChapter(null)}
            />
        </Card>
    );
} 