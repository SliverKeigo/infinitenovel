'use client';

import { useNovelStore } from '@/store/use-novel-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookText } from 'lucide-react';

export const NovelDescriptionCard = () => {
  const description = useNovelStore((state) => state.currentNovel?.description);

  if (!description) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookText className="h-5 w-5 text-primary" />
          <span>故事简介</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="prose prose-sm dark:prose-invert max-w-none">
        <p className="whitespace-pre-wrap leading-relaxed">
            {description}
        </p>
      </CardContent>
    </Card>
  );
}; 