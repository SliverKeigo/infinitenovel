import { Loader2 } from "lucide-react";

export function WorldAnvilSidebarSkeleton() {
  return (
    <div className="w-full max-w-sm flex-shrink-0">
      <div className="sticky top-8 space-y-6">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-5 flex justify-center items-center min-h-[150px]">
          <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
        </div>
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-5 flex justify-center items-center min-h-[120px]">
          <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
        </div>
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-5 flex justify-center items-center min-h-[90px]">
          <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
        </div>
      </div>
    </div>
  );
}
