'use client';

import { useState } from 'react';
import { useNovelStore } from "@/store/use-novel-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

export const CharacterManager = () => {
    const { characters } = useNovelStore();
    const [isOpen, setIsOpen] = useState(true)

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="w-full"
        >
        <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                        <span>人物角色 ({characters.length})</span>
                </CardTitle>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-9 p-0">
                            <ChevronsUpDown className="h-4 w-4" />
                            <span className="sr-only">Toggle</span>
                        </Button>
                    </CollapsibleTrigger>
            </CardHeader>
                <CollapsibleContent>
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
                            <ul className="space-y-4 max-h-[400px] overflow-y-auto pr-4">
                        {characters.map((character) => (
                            <li key={character.id} className="border-b border-muted pb-2 last:border-b-0">
                                <p className="font-semibold">{character.name}</p>
                                <p className="text-sm text-muted-foreground">{character.core_setting}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
                </CollapsibleContent>
        </Card>
        </Collapsible>
    );
}; 