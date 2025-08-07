"use client"

import { useState } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, Edit } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAiConfigStore } from '@/hooks/useAiConfigStore';
import { ModelConfig } from '@/types/ai';

// 表单验证
const formSchema = z.object({
  name: z.string().min(1, "名称不能为空"),
  type: z.enum(['generation', 'embedding'], { required_error: "必须选择模型类型" }),
  baseURL: z.string().url("请输入有效的URL"),
  apiKey: z.string().min(1, "API Key不能为空"),
  model: z.string().min(1, "模型名称不能为空"),
});

// 添加/编辑模型的表单
function ModelForm({ config, onSave, onCancel }: { config?: ModelConfig, onSave: (data: ModelConfig) => void, onCancel: () => void }) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: config?.name || "",
      type: config?.type || "generation",
      baseURL: config?.baseURL || "",
      apiKey: config?.apiKey || "",
      model: config?.model || "",
    },
  });

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    onSave({ id: config?.id || '', ...values });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl border border-white/20 shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold text-white mb-6">{config ? "编辑模型" : "添加新模型"}</h2>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Form Fields */}
            <FormField name="name" control={form.control} render={({ field }) => (
              <FormItem><FormLabel className="text-slate-300">名称</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField name="type" control={form.control} render={({ field }) => (
              <FormItem><FormLabel className="text-slate-300">类型</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                <SelectContent className="bg-slate-900/95 backdrop-blur-lg border border-white/20"><SelectItem value="generation">文本生成</SelectItem><SelectItem value="embedding">向量</SelectItem></SelectContent>
              </Select><FormMessage /></FormItem>
            )}/>
            <FormField name="baseURL" control={form.control} render={({ field }) => (
              <FormItem><FormLabel className="text-slate-300">API 地址</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField name="apiKey" control={form.control} render={({ field }) => (
              <FormItem><FormLabel className="text-slate-300">API Key</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField name="model" control={form.control} render={({ field }) => (
              <FormItem><FormLabel className="text-slate-300">模型名称</FormLabel><FormControl><Input placeholder="例如: gpt-4o" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <div className="flex justify-end gap-4 !mt-8">
              <Button type="button" variant="ghost" onClick={onCancel} className="text-slate-300">取消</Button>
              <Button type="submit">保存</Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

// 主页面
export default function SettingsView() {
  const { models, addModel, updateModel, deleteModel, setActiveModel, activeGenerationModelId, activeEmbeddingModelId } = useAiConfigStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ModelConfig | undefined>(undefined);

  const handleSave = (data: ModelConfig) => {
    if (editingConfig) {
      updateModel(editingConfig.id, data);
    } else {
      addModel(data);
    }
    setIsFormOpen(false);
    setEditingConfig(undefined);
  };

  return (
    <>
      {/* 激活模型选择 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl">
          <h3 className="text-lg font-semibold text-white mb-2">当前文本生成模型</h3>
          <Select onValueChange={(id) => setActiveModel(id, 'generation')} value={activeGenerationModelId || undefined}>
            <SelectTrigger><SelectValue placeholder="未选择" /></SelectTrigger>
            <SelectContent className="bg-slate-900/95 backdrop-blur-lg border border-white/20">
              {models.filter(m => m.type === 'generation').map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl">
          <h3 className="text-lg font-semibold text-white mb-2">当前向量模型</h3>
           <Select onValueChange={(id) => setActiveModel(id, 'embedding')} value={activeEmbeddingModelId || undefined}>
            <SelectTrigger><SelectValue placeholder="未选择" /></SelectTrigger>
            <SelectContent className="bg-slate-900/95 backdrop-blur-lg border border-white/20">
              {models.filter(m => m.type === 'embedding').map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 模型列表 */}
      <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-white">模型库</h2>
          <Button onClick={() => { setEditingConfig(undefined); setIsFormOpen(true); }}><Plus className="mr-2 h-4 w-4"/>添加模型</Button>
        </div>
        <div className="space-y-4">
          {models.map(config => (
            <div key={config.id} className="bg-white/10 p-4 rounded-lg flex justify-between items-center">
              <div>
                <p className="font-bold text-white">{config.name} <span className="text-xs ml-2 px-2 py-1 bg-blue-400/20 text-blue-300 rounded-full">{config.type}</span></p>
                <p className="text-sm text-slate-400">{config.model}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => { setEditingConfig(config); setIsFormOpen(true); }}><Edit className="h-4 w-4"/></Button>
                <Button variant="ghost" size="icon" onClick={() => deleteModel(config.id)}><Trash2 className="h-4 w-4"/></Button>
              </div>
            </div>
          ))}
          {models.length === 0 && <p className="text-center text-slate-400 py-4">还没有添加任何模型。</p>}
        </div>
      </div>

      {isFormOpen && <ModelForm config={editingConfig} onSave={handleSave} onCancel={() => setIsFormOpen(false)} />}
    </>
  )
}
