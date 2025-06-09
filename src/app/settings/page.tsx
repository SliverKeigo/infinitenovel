"use client";

import { GenerationSettingsManager } from "@/components/settings/GenerationSettingsManager";

const SettingsPage = () => {
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">生成设置</h1>
      <p className="text-muted-foreground mb-6">
        在这里调整小说的生成参数，或选择一个预设来快速开始。
      </p>
      <GenerationSettingsManager />
    </main>
  );
};

export default SettingsPage; 