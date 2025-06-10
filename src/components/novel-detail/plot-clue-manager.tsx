'use client';

import { useNovelStore } from "@/store/use-novel-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";

export const PlotClueManager = () => {
    const { plotClues } = useNovelStore();

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <span>情节线索</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {plotClues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted p-12 text-center h-full">
                        <div className="mb-4 rounded-full bg-secondary p-4">
                            <Zap className="h-12 w-12 text-secondary-foreground" />
                        </div>
                        <h3 className="text-xl font-bold tracking-tight">还没有情节线索</h3>
                        <p className="text-sm text-muted-foreground mt-2">系统会在生成章节时自动构建情节线索。</p>
                    </div>
                ) : (
                    <div>
                        {/* 情节线索列表将在这里渲染 */}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}; 