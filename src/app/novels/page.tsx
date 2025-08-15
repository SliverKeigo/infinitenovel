import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import NovelsListView from "@/components/novel/NovelsListView";

export default function NovelsPage() {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white">我的小说</h1>
        <Link href="/create" passHref>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            创作新小说
          </Button>
        </Link>
      </div>
      <NovelsListView />
    </div>
  );
}
