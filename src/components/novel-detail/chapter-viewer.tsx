'use client';

import { useState } from 'react';
import type { Chapter } from '@/types/chapter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Check } from 'lucide-react';

interface ChapterViewerProps {
  chapter: Chapter | null;
  onClose: () => void;
}

export const ChapterViewer = ({ chapter, onClose }: ChapterViewerProps) => {
  const [isCopied, setIsCopied] = useState(false);

  if (!chapter) {
    return null;
  }

  const handleCopy = () => {
    if (chapter.content) {
      navigator.clipboard.writeText(chapter.content);
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    }
  };

  return (
    <Dialog open={!!chapter} onOpenChange={(isOpen) => {
      if (!isOpen) {
        onClose();
        setIsCopied(false); // Reset copy status on close
      }
    }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{`第 ${chapter.chapter_number} 章: ${chapter.title}`}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[70vh] rounded-md border p-4">
           <p className="text-base leading-relaxed whitespace-pre-wrap font-sans">
               {chapter.content}
           </p>
        </ScrollArea>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" onClick={handleCopy}>
            {isCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {isCopied ? '已复制!' : '复制内容'}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              关闭
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 