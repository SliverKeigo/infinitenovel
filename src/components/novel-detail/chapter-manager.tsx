'use client';

import { useMemo, useState, useEffect } from 'react';
import { useNovelStore } from "@/store/use-novel-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookMarked, PlusCircle, Loader2, ArrowUpNarrowWide, ArrowDownWideNarrow, Search, ChevronsDown, ChevronsUp, BookOpen, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { ExpansionControlCenter } from './expansion-control-center';
import { useAppStatusStore, ModelLoadStatus } from '@/store/use-app-status-store';
import { ChapterViewer } from './chapter-viewer';
import { Chapter } from '@/types/chapter';
import { Input } from '@/components/ui/input';
import { toast } from "sonner";

// 定义每页显示的章节数量
const ITEMS_PER_PAGE = 10;

export const ChapterManager = () => {
    const { 
        chapters, 
        currentNovel, 
        buildNovelIndex, 
        indexLoading, 
        currentNovelIndex,
        generationLoading,
        generationTask,
        updateNovelStats,
    } = useNovelStore();
    
    const { embeddingModelStatus, embeddingModelProgress } = useAppStatusStore();
    const [showControlCenter, setShowControlCenter] = useState(false);
    const [viewingChapter, setViewingChapter] = useState<Chapter | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    const [syncing, setSyncing] = useState(false);
    
    // 添加分页状态
    const [currentPage, setCurrentPage] = useState(1);

    const isEmbeddingModelReady = embeddingModelStatus === ModelLoadStatus.LOADED;
    const isEmbeddingModelLoading = embeddingModelStatus === ModelLoadStatus.LOADING;
    const isAnythingLoading = indexLoading || isEmbeddingModelLoading;

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

    // 过滤和排序章节
    const filteredAndSortedChapters = useMemo(() => {
        return chapters
            .filter(chapter => 
                chapter.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                `第 ${chapter.chapterNumber} 章`.includes(searchTerm)
            )
            .sort((a, b) => {
                if (sortOrder === 'asc') {
                    return a.chapterNumber - b.chapterNumber;
                }
                return b.chapterNumber - a.chapterNumber;
            });
    }, [chapters, searchTerm, sortOrder]);
    
    // 计算总页数
    const totalPages = useMemo(() => {
        return Math.ceil(filteredAndSortedChapters.length / ITEMS_PER_PAGE);
    }, [filteredAndSortedChapters]);
    
    // 获取当前页的章节
    const currentPageChapters = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredAndSortedChapters.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredAndSortedChapters, currentPage]);
    
    // 处理页面变化
    const handlePageChange = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };
    
    // 当过滤条件改变时，重置到第一页
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, sortOrder]);

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        <span>章节管理</span>
                    </CardTitle>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleToggleControlCenter}
                        disabled={isEmbeddingModelLoading || indexLoading || (generationLoading && generationTask.isActive)}
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
            </CardHeader>
            <CardContent>
                {showControlCenter && <ExpansionControlCenter onClose={() => setShowControlCenter(false)} />}
                
                {filteredAndSortedChapters.length === 0 && !showControlCenter && !generationLoading ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted p-12 text-center">
                        {searchTerm ? (
                            <>
                                <Search className="h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-4 text-xl font-bold tracking-tight">未找到匹配的章节</h3>
                                <p className="text-sm text-muted-foreground mt-2">请尝试使用其他关键词进行搜索。</p>
                            </>
                        ) : (
                            <>
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
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {currentPageChapters.map((chapter) => (
                            <div 
                                key={chapter.id} 
                                className="flex items-center justify-between rounded-lg border p-4"
                            >
                                <div className="space-y-1">
                                    <p className="font-semibold">{`第 ${chapter.chapterNumber} 章: ${chapter.title}`}</p>
                                    <p className="text-sm text-muted-foreground">
                                        状态: <span className="capitalize">{chapter.status}</span> | 字数: {chapter.wordCount}
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => setViewingChapter(chapter)}>阅读</Button>
                            </div>
                        ))}
                        
                        {/* 分页控制 */}
                        {filteredAndSortedChapters.length > ITEMS_PER_PAGE && (
                            <div className="flex items-center justify-between pt-4">
                                <div className="text-sm text-muted-foreground">
                                    显示 {filteredAndSortedChapters.length} 章中的 
                                    {' '}{Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredAndSortedChapters.length)} - 
                                    {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedChapters.length)} 章
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePageChange(currentPage - 1)}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        <span>上一页</span>
                                    </Button>
                                    <div className="text-sm">
                                        第 {currentPage} / {totalPages} 页
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePageChange(currentPage + 1)}
                                        disabled={currentPage >= totalPages}
                                    >
                                        <span>下一页</span>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
            <ChapterViewer chapter={viewingChapter} onClose={() => setViewingChapter(null)} />
        </Card>
    );
}; 