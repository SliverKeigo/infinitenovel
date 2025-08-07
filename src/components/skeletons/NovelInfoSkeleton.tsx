export function NovelInfoSkeleton() {
  return (
    <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl animate-pulse">
      <div className="h-8 bg-slate-700 rounded w-3/4 mb-4"></div>
      <div className="h-4 bg-slate-700 rounded w-full mb-2"></div>
      <div className="h-4 bg-slate-700 rounded w-5/6 mb-6"></div>
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div className="bg-white/5 p-3 rounded-lg border border-white/10">
          <div className="h-3 bg-slate-700 rounded w-1/2 mx-auto mb-2"></div>
          <div className="h-5 bg-slate-600 rounded w-3/4 mx-auto"></div>
        </div>
        <div className="bg-white/5 p-3 rounded-lg border border-white/10">
          <div className="h-3 bg-slate-700 rounded w-1/2 mx-auto mb-2"></div>
          <div className="h-5 bg-slate-600 rounded w-3/4 mx-auto"></div>
        </div>
        <div className="bg-white/5 p-3 rounded-lg border border-white/10">
          <div className="h-3 bg-slate-700 rounded w-1/2 mx-auto mb-2"></div>
          <div className="h-5 bg-slate-600 rounded w-3/4 mx-auto"></div>
        </div>
        <div className="bg-white/5 p-3 rounded-lg border border-white/10">
          <div className="h-3 bg-slate-700 rounded w-1/2 mx-auto mb-2"></div>
          <div className="h-5 bg-slate-600 rounded w-3/4 mx-auto"></div>
        </div>
      </div>
    </div>
  );
}
