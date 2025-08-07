import { prisma } from "@/lib/prisma";
import { FileText } from "lucide-react";

type ChapterListProps = {
  novelId: string;
};

export async function ChapterList({ novelId }: ChapterListProps) {
  const chapters = await prisma.novelChapter.findMany({
    where: { novelId: novelId },
    orderBy: { createdAt: "asc" },
  });

  const chapterCount = chapters.length;

  return (
    <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl">
      <h2 className="text-2xl font-semibold mb-4 flex items-center gap-3">
        <FileText className="text-blue-400" />
        章节列表
      </h2>
      <div>
        {chapterCount > 0 ? (
          <ul className="space-y-2">
            {chapters.map((chapter) => (
              <li
                key={chapter.id}
                className="text-slate-300 hover:text-white transition-colors cursor-pointer p-2 rounded-md hover:bg-white/5"
              >
                {chapter.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400">还没有任何章节。</p>
        )}
      </div>
    </div>
  );
}
