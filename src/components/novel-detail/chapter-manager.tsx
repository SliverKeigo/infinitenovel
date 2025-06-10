'use client';

import { useNovelStore } from "@/store/use-novel-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookMarked, PlusCircle } from "lucide-react";

export const ChapterManager = () => {
    const { chapters } = useNovelStore();

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <BookMarked className="h-5 w-5 text-primary" />
                    <span>章节管理</span>
                </CardTitle>
                <Button variant="outline" size="sm">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    生成下一章
                </Button>
            </CardHeader>
            <CardContent>
                {chapters.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted p-12 text-center">
                        <div className="mb-4 rounded-full bg-secondary p-4">
                            <BookMarked className="h-12 w-12 text-secondary-foreground" />
                        </div>
                        <h3 className="text-xl font-bold tracking-tight">还没有章节</h3>
                        <p className="text-sm text-muted-foreground mt-2 mb-4">点击"生成下一章"开始创作第一章。</p>
                        <Button>
                           生成第一章
                        </Button>
                    </div>
                ) : (
                    <div>
                        {/* 章节列表将在这里渲染 */}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}; 