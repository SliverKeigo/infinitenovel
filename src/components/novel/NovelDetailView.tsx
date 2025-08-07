import { Suspense } from "react";
import { ChapterGenerator } from "@/components/novel/ChapterGenerator";
import { NovelInfo } from "@/components/novel/NovelInfo";
import { ChapterList } from "@/components/novel/ChapterList";
import { WorldAnvilData } from "@/components/novel/WorldAnvilData";
import { NovelInfoSkeleton } from "@/components/skeletons/NovelInfoSkeleton";
import { ChapterListSkeleton } from "@/components/skeletons/ChapterListSkeleton";
import { WorldAnvilSidebarSkeleton } from "@/components/skeletons/WorldAnvilSidebarSkeleton";

type NovelDetailViewProps = {
  novelId: string;
};

// 这个组件不需要是 async 的
export function NovelDetailView({ novelId }: NovelDetailViewProps) {
  return (
    <div className="flex gap-8 p-8">
      <main className="flex-grow space-y-8">
        <Suspense fallback={<NovelInfoSkeleton />}>
          {/* 数据获取现在被安全地隔离在这个异步组件里 */}
          <NovelInfo novelId={novelId} />
        </Suspense>

        <ChapterGenerator novelId={novelId} />

        <Suspense fallback={<ChapterListSkeleton />}>
          <ChapterList novelId={novelId} />
        </Suspense>
      </main>

      <aside className="w-full max-w-sm flex-shrink-0">
        <Suspense fallback={<WorldAnvilSidebarSkeleton />}>
          <WorldAnvilData novelId={novelId} />
        </Suspense>
      </aside>
    </div>
  );
}
