"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Book, Sparkles, Type } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useCreationStore } from "@/hooks/useCreationStore";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAiConfigStore } from "@/hooks/useAiConfigStore";

const formSchema = z.object({
  title: z
    .string()
    .min(2, "标题至少需要2个字符")
    .max(50, "标题不能超过50个字符"),
  summary: z.string().min(10, "简介至少需要10个字符"),
  presetChapters: z.coerce.number().min(1, "章节数必须大于0"),
  category: z.string().min(1, "请选择分类"),
  subCategory: z.string().min(1, "请选择子分类"),
});

function NovelSettingsForm() {
  const { novelSettings, setNovelSettings } = useCreationStore();
  const { getActiveGenerationModel, getActiveEmbeddingModel } = useAiConfigStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...novelSettings,
      presetChapters: novelSettings.presetChapters || 100,
    },
  });

  // Sync form state back to Zustand store on change
  useEffect(() => {
    const subscription = form.watch((value) => {
      setNovelSettings(value);
    });
    return () => subscription.unsubscribe();
  }, [form, setNovelSettings]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setError(null);
    setIsLoading(true);

    const generationConfig = getActiveGenerationModel();
    const embeddingConfig = getActiveEmbeddingModel();

    if (!generationConfig || !embeddingConfig) {
      setError("请先在“AI模型设置”页面同时激活一个文本生成模型和一个向量模型。");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/novels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          generationConfig,
          embeddingConfig,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "创建小说失败，请检查后台日志。");
      }

      const newNovel = await response.json();
      console.log("小说创建成功:", newNovel);
      
      // Optional: Reset form or show success message before redirecting
      // form.reset();
      // useCreationStore.getState().resetCreation();

      router.push(`/novels/${newNovel.id}`); // Redirect to the new novel's page

    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          name="title"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-slate-300">小说标题</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="summary"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-slate-300">小说简介</FormLabel>
              <FormControl>
                <Textarea {...field} rows={5} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="presetChapters"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-slate-300">预计完结章节数</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="category"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-slate-300">小说分类</FormLabel>
               <FormControl>
                <Input {...field} placeholder="例如：奇幻" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="subCategory"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-slate-300">子分类</FormLabel>
               <FormControl>
                <Input {...field} placeholder="例如：东方玄幻" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isLoading} className="w-full !mt-8">
          {isLoading ? "正在生成大纲..." : "创建小说并生成大纲"}
        </Button>
        {error && <p className="text-sm text-red-400 text-center mt-2">{error}</p>}
      </form>
    </Form>
  );
}

function AiAssistantPanel() {
  const { isGenerating, progress } = useCreationStore();

  return (
    <div className="space-y-6">
      {/* This panel can be used for showing generation progress in the future */}
      {(isGenerating) && (
        <div className="flex flex-col gap-2 text-center">
          <Progress value={progress} className="w-full" />
          <p className="text-sm text-slate-400">正在处理... {progress}%</p>
        </div>
      )}
    </div>
  );
}

export default function CreateNovelView() {
  const { generatedContent } = useCreationStore();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
      <div className="lg:col-span-2 space-y-8">
        <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Book className="text-blue-400" />
            小说设定
          </h2>
          <NovelSettingsForm />
        </div>
        <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl h-full">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Type className="text-blue-400" />
            生成内容
          </h2>
          <div className="text-slate-200 bg-black/20 p-4 rounded-md min-h-[200px] whitespace-pre-wrap text-sm">
            {generatedContent || "AI生成的故事大纲或其他内容将显示在这里。"}
          </div>
        </div>
      </div>
      <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-2xl">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="text-blue-400" />
          AI 助手
        </h2>
        <AiAssistantPanel />
      </div>
    </div>
  );
}
