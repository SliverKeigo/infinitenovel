"use client";

import { Suspense, useCallback, useState } from "react";
import { ChapterGenerator } from "./ChapterGenerator";
import { ChapterList } from "./ChapterList";
import { ChapterListSkeleton } from "../skeletons/ChapterListSkeleton";

type ChapterManagementProps = {
  novelId: string;
};

export function ChapterManagement({ novelId }: ChapterManagementProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((prevKey) => prevKey + 1);
  }, []);

  return (
    <>
      <ChapterGenerator novelId={novelId} onGenerationComplete={handleRefresh} />
      <Suspense fallback={<ChapterListSkeleton />}>
        <ChapterList novelId={novelId} key={refreshKey} />
      </Suspense>
    </>
  );
}
