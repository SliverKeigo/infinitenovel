"use client";

import { AiConfigManager } from '@/components/ai/AiConfigManager';

const AIConfigPage = () => {
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AI 配置</h1>
      <p className="text-muted-foreground mb-6">
        管理您的语言模型连接。系统将使用标记为"已激活"的配置来生成内容。
      </p>
      <AiConfigManager />
    </main>
  );
};

export default AIConfigPage; 