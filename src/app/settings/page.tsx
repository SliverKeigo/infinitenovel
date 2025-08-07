import SettingsView from "@/components/settings/SettingsView";

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-white mb-8">AI 模型设置</h1>
      <SettingsView />
    </div>
  );
}
