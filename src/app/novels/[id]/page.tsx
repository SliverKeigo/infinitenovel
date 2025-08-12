import { NovelDetailView } from "@/components/novel/NovelDetailView";

export const dynamic = "force-dynamic";

type NovelDetailPageProps = {
  params: {
    id: string;
  };
};

// This component is now async to align with Next.js best practices
export default async function NovelDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const novelId = params.id;
  return <NovelDetailView novelId={novelId} />;
}
