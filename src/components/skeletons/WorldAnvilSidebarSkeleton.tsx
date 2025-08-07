export function WorldAnvilSidebarSkeleton() {
  return (
    <div className="w-full max-w-sm flex-shrink-0 animate-pulse">
      <div className="sticky top-8 space-y-6">
        {/* Roles Skeleton */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-5">
          <div className="h-6 w-3/4 mb-4 bg-slate-700 rounded"></div>
          <div className="space-y-3">
            <div className="h-5 w-full bg-slate-700 rounded"></div>
            <div className="h-5 w-5/6 bg-slate-700 rounded"></div>
            <div className="h-5 w-full bg-slate-700 rounded"></div>
          </div>
        </div>
        {/* Scenes Skeleton */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-5">
          <div className="h-6 w-3/4 mb-4 bg-slate-700 rounded"></div>
          <div className="space-y-3">
            <div className="h-5 w-full bg-slate-700 rounded"></div>
            <div className="h-5 w-5/6 bg-slate-700 rounded"></div>
          </div>
        </div>
        {/* Clues Skeleton */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-5">
          <div className="h-6 w-3/4 mb-4 bg-slate-700 rounded"></div>
          <div className="space-y-3">
            <div className="h-5 w-full bg-slate-700 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
