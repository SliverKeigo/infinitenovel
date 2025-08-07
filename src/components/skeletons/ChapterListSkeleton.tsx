import { FileText } from "lucide-react";

export function ChapterListSkeleton() {
  return (
    <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl animate-pulse">
      <div className="h-8 bg-slate-700 rounded w-1/2 mb-6 flex items-center gap-3">
        <FileText className="text-slate-600" />
        <span className="w-32 h-6 bg-slate-700 rounded"></span>
      </div>
      <div className="space-y-3">
        <div className="h-6 bg-slate-700 rounded w-full"></div>
        <div className="h-6 bg-slate-700 rounded w-full"></div>
        <div className="h-6 bg-slate-700 rounded w-5/6"></div>
        <div className="h-6 bg-slate-700 rounded w-3/4"></div>
      </div>
    </div>
  );
}
