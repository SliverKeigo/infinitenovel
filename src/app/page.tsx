"use client";

import { BookOpen, Edit, Settings } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const GlassCard = ({ icon: Icon, title, description, linkHref, linkText }) => (
  <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl flex flex-col">
    <div className="flex items-center gap-4 mb-4">
      <div className="p-3 bg-white/10 rounded-full">
        <Icon className="h-8 w-8 text-white" />
      </div>
      <h3 className="text-2xl font-semibold text-white">{title}</h3>
    </div>
    <p className="text-gray-300 mb-6 flex-grow">{description}</p>
    <Link href={linkHref}>
      <Button
        variant="outline"
        className="w-full sm:w-auto bg-white/10 hover:bg-white/20 border-white/20 text-white"
      >
        {linkText}
      </Button>
    </Link>
  </div>
);

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-white mb-8">仪表盘</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <GlassCard
          icon={Edit}
          title="创建新小说"
          description="开启您的文学创作之旅"
          linkHref="/create"
          linkText="立即开始"
        />
        <GlassCard
          icon={BookOpen}
          title="我的小说"
          description="管理和编辑您的所有作品"
          linkHref="/novels"
          linkText="查看文库"
        />
        <GlassCard
          icon={Settings}
          title="AI 设置"
          description="个性化您的 AI 写作助手"
          linkHref="/settings"
          linkText="前往配置"
        />
      </div>
    </div>
  );
}
