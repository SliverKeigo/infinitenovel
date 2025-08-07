import { Loader2 } from "lucide-react";

export function ChapterListSkeleton() {
  return (
    <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl flex justify-center items-center min-h-[200px]">
      <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
    </div>
  );
}
