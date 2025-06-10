'use client';

import { useNovelStore } from "@/store/use-novel-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export const CharacterManager = () => {
    const { characters } = useNovelStore();

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <span>人物角色</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {characters.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted p-12 text-center h-full">
                        <div className="mb-4 rounded-full bg-secondary p-4">
                            <Users className="h-12 w-12 text-secondary-foreground" />
                        </div>
                        <h3 className="text-xl font-bold tracking-tight">还没有人物</h3>
                        <p className="text-sm text-muted-foreground mt-2">系统会在生成章节时自动创建人物。</p>
                    </div>
                ) : (
                    <ul className="space-y-4">
                        {characters.map((character) => (
                            <li key={character.id} className="border-b border-muted pb-2 last:border-b-0">
                                <p className="font-semibold">{character.name}</p>
                                <p className="text-sm text-muted-foreground">{character.coreSetting}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}; 