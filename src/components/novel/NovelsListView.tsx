import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, BookOpen } from "lucide-react";
import { Novel } from "@prisma/client";
import { Loader2 } from "lucide-react";

function NovelCard({ novel }: { novel: Novel }) {
  const shortSummary =
    novel.summary.length > 80
      ? novel.summary.substring(0, 80) + "..."
      : novel.summary;

  return (
    <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl h-full flex flex-col justify-between transition-all duration-300 hover:border-white/30 hover:bg-white/15">
      <div>
        <h3 className="text-xl font-bold mb-2 text-white">{novel.title}</h3>
        <p className="text-slate-300 text-sm mb-4 h-20">{shortSummary}</p>
      </div>
      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="flex justify-between items-center text-xs text-slate-400 mb-3">
          <span>{novel.type}</span>
          <span>
            最后更新: {new Date(novel.updatedAt).toLocaleDateString()}
          </span>
        </div>
        <Link href={`/novels/${novel.id}`} passHref>
          <Button variant="outline" className="w-full">
            打开
          </Button>
        </Link>
      </div>
    </div>
  );
}

async function NovelsList() {
  const novels = await prisma.novel.findMany({
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (novels.length === 0) {
    return (
      <div className="text-center py-20 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10">
        <BookOpen className="mx-auto h-12 w-12 text-slate-400" />
        <h3 className="mt-2 text-lg font-medium text-white">还没有任何小说</h3>
        <p className="mt-1 text-sm text-slate-400">
          开始创作你的第一部作品吧！
        </p>
        <div className="mt-6">
          <Link href="/create" passHref>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              创作新小说
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {novels.map((novel) => (
        <NovelCard key={novel.id} novel={novel} />
      ))}
    </div>
  );
}

function NovelsListSkeleton() {
  return (
    <div className="flex justify-center items-center h-64 bg-white/5 rounded-2xl">
      <Loader2 className="h-12 w-12 text-blue-400 animate-spin" />
    </div>
  );
}

export default function NovelsListView() {
  return (
    <Suspense fallback={<NovelsListSkeleton />}>
      <NovelsList />
    </Suspense>
  );
}
