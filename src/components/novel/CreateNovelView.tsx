"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Book } from "lucide-react";
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
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAiConfigStore } from "@/hooks/useAiConfigStore";
import { toast } from "sonner";

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

export default function CreateNovelView() {
  const [isLoading, setIsLoading] = useState(false);
  const { getActiveGenerationModel, getActiveEmbeddingModel } =
    useAiConfigStore();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      summary: "",
      presetChapters: 100,
      category: "",
      subCategory: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    toast.info("正在创建小说并生成大纲，请稍候...", {
      duration: Infinity, // The toast will be dismissed programmatically
    });

    const generationConfig = getActiveGenerationModel();
    const embeddingConfig = getActiveEmbeddingModel();

    if (!generationConfig || !embeddingConfig) {
      toast.error(
        "请先在“AI模型设置”页面同时激活一个文本生成模型和一个向量模型。",
      );
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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "创建小说失败。");
      }

      toast.success("小说创建成功！正在跳转...");
      router.push(`/novels/${result.id}`);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "发生未知错误。";
      toast.error(errorMessage);
      setIsLoading(false);
    } finally {
      // Dismiss all toasts before finishing
      toast.dismiss();
    }
  }

  return (
    <div className="flex justify-center items-start pt-8 h-full">
      <div className="w-full max-w-4xl bg-white/10 backdrop-blur-xl p-8 rounded-2xl border border-white/20 shadow-2xl">
        <h2
          className="text-2xl font-semibold mb-6 flex items-center gap-2 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]
text-white"
        >
          <Book className="text-blue-400" />
          小说设定
        </h2>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4"
          >
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
              name="presetChapters"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">
                    预计完结章节数
                  </FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
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
            <div className="md:col-span-2">
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
            </div>
            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full !mt-6"
              >
                {isLoading ? "正在生成..." : "创建小说并生成大纲"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
