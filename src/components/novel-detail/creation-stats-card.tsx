'use client';

import { useNovelStore } from '@/store/use-novel-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart2, BookOpen, Clock, PlusSquare, Scale } from 'lucide-react';

const StatItem = ({ icon: Icon, label, value, unit }: { icon: React.ElementType, label: string, value: string | number, unit: string }) => (
    <div className="flex flex-col items-center justify-center space-y-1 rounded-lg bg-muted/50 p-4 text-center">
        <Icon className="h-6 w-6 text-muted-foreground" />
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label} ({unit})</p>
    </div>
);

export const CreationStatsCard = () => {
    const novel = useNovelStore((state) => state.currentNovel);

    if (!novel) return null;
    
    const averageWordsPerChapter = novel.chapterCount > 0 ? Math.round(novel.wordCount / novel.chapterCount) : 0;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BarChart2 className="h-5 w-5 text-primary" />
                    <span>创作统计</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
                <StatItem icon={Scale} label="总字数" value={novel.wordCount.toLocaleString()} unit="字" />
                <StatItem icon={Clock} label="预计阅读" value={Math.ceil(novel.wordCount / 500)} unit="分钟" />
                <StatItem icon={BookOpen} label="平均章节字数" value={averageWordsPerChapter.toLocaleString()} unit="字" />
                <StatItem icon={PlusSquare} label="扩写次数" value={novel.expansionCount ?? 0} unit="次" />
            </CardContent>
        </Card>
    );
}; 
 