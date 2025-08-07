import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

type NovelInfoProps = {
  novelId: string;
};

export async function NovelInfo({ novelId }: NovelInfoProps) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      _count: {
        select: { chapters: true },
      },
    },
  });

  if (!novel) {
    notFound();
  }

  const chapterCount = novel._count.chapters;

  return (
    <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl">
      <h1 className="text-3xl font-bold text-white mb-2">{novel.title}</h1>
      <p className="text-slate-300 mb-4">{novel.summary}</p>
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <InfoPill label="类型" value={novel.type} />
        <InfoPill
          label="章节"
          value={`${chapterCount} / ${novel.presetChapters}`}
        />
        <InfoPill label="字数" value={novel.currentWordCount.toString()} />
        <InfoPill
          label="最后更新"
          value={new Date(novel.updatedAt).toLocaleDateString()}
        />
      </div>
    </div>
  );
}

const InfoPill = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-white/5 backdrop-blur-xl p-3 rounded-lg border border-white/10 text-center">
    <div className="text-xs text-slate-400 mb-1">{label}</div>
    <div className="font-bold text-white">{value}</div>
  </div>
);
