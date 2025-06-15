'use client';

import { useNovelStore } from "@/store/use-novel-store";
import { Card, CardContent } from "@/components/ui/card";
import { BookCopy, Users, BookUp, Repeat } from "lucide-react";

const StatCard = ({ icon: Icon, label, value, unit }: { icon: React.ElementType, label: string, value: number, unit: string }) => {
    return (
        <Card className="p-4">
            <CardContent className="p-0 flex flex-col items-center justify-center space-y-2">
                <Icon className="h-8 w-8 text-primary" />
                <p className="text-3xl font-bold">{value}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
            </CardContent>
        </Card>
    )
}


export const KeyStats = () => {
    const novel = useNovelStore((state) => state.currentNovel);

    if (!novel) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={BookCopy} label="已完成章节" value={novel.chapter_count} unit="章" />
        <StatCard icon={BookUp} label="总字数" value={novel.word_count} unit="字" />
        <StatCard icon={Users} label="人物数量" value={novel.character_count} unit="个" />
        <StatCard icon={Repeat} label="扩写次数" value={novel.expansion_count} unit="次" />
    </div>
  );
}; 