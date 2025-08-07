"use client";
import dynamic from "next/dynamic";

const CreateNovelView = dynamic(
  () => import("@/components/novel/CreateNovelView"),
  { 
    ssr: false,
    loading: () => <p className="text-center">Loading...</p> 
  }
);

export default function CreatePage() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-8">创作新篇章</h1>
      <CreateNovelView />
    </div>
  );
}

