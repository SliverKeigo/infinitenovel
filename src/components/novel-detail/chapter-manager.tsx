'use client';

import { useState } from 'react';
import { useNovelStore } from "@/store/use-novel-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookMarked, PlusCircle, Loader2 } from "lucide-react";
import { ExpansionControlCenter } from './expansion-control-center';
import { useAppStatusStore, ModelLoadStatus } from '@/store/use-app-status-store';
import { ChapterViewer } from './chapter-viewer';
import { Chapter } from '@/types/chapter';

export const ChapterManager = () => {
    const { 
        chapters, 
        currentNovel, 
        buildNovelIndex, 
        indexLoading, 
        currentNovelIndex 
    } = useNovelStore();
    
    const { embeddingModelStatus, embeddingModelProgress } = useAppStatusStore();
    const [isGenerating, setIsGenerating] = useState(false);
    const [viewingChapter, setViewingChapter] = useState<Chapter | null>(null);

    const handleToggleGeneration = () => {
        const novelId = currentNovel?.id;
        if (!isGenerating && !currentNovelIndex && novelId) {
            buildNovelIndex(novelId);
            // Don't open the panel immediately, let the index build first.
            // The user can click again once the index is ready.
            return;
        }
        setIsGenerating(prev => !prev);
    };
    
    const isEmbeddingModelReady = embeddingModelStatus === ModelLoadStatus.LOADED;
    const isEmbeddingModelLoading = embeddingModelStatus === ModelLoadStatus.LOADING;
    const isAnythingLoading = indexLoading || isEmbeddingModelLoading;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <BookMarked className="h-5 w-5 text-primary" />
                    <span>章节管理</span>
                </CardTitle>
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleToggleGeneration}
                    disabled={isAnythingLoading}
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
                    ) : (
                       <>
                           <PlusCircle className="mr-2 h-4 w-4" />
                           {isGenerating ? '收起面板' : (currentNovelIndex ? '生成下一章' : '准备创作引擎')}
                       </>
                    )}
                </Button>
            </CardHeader>
            <CardContent>
                {isGenerating && <ExpansionControlCenter onClose={() => setIsGenerating(false)} />}
                
                {chapters.length === 0 && !isGenerating ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted p-12 text-center">
                        <div className="mb-4 rounded-full bg-secondary p-4">
                            <BookMarked className="h-12 w-12 text-secondary-foreground" />
                        </div>
                        <h3 className="text-xl font-bold tracking-tight">还没有章节</h3>
                        <p className="text-sm text-muted-foreground mt-2 mb-4">准备好开始创作你的第一章了吗？</p>
                        <Button 
                            onClick={handleToggleGeneration}
                            disabled={isAnythingLoading}
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
                           ) : '生成第一章')}
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {chapters.map((chapter) => (
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
                    </div>
                )}
            </CardContent>
            <ChapterViewer chapter={viewingChapter} onClose={() => setViewingChapter(null)} />
        </Card>
    );
}; 