import { NovelDetailView } from "@/components/novel/NovelDetailView";

type NovelDetailPageProps = {
  params: {
    id: string;
  };
};

// 注意：这个页面组件不再是 async！
export default function NovelDetailPage({ params }: NovelDetailPageProps) {
  return <NovelDetailView novelId={params.id} />;
}
