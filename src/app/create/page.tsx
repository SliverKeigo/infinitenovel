'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useNovelStore } from '@/store/use-novel-store';
import Link from "next/link";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { GenerationProgress } from "@/components/generation-progress";
import { Sparkles, Book, Bot, Gem, PencilRuler, Target, Text, Workflow } from "lucide-react";


const formSchema = z.object({
  name: z.string().min(2, {
    message: '小说名称至少需要2个字符。',
  }).max(50, {
      message: '小说名称不能超过50个字符。'
  }),
  genre: z.string().min(2, {
    message: '题材类型至少需要2个字符。',
  }).max(100, {
      message: '题材类型不能超过100个字符。'
  }),
  style: z.string().min(2, {
    message: '写作风格至少需要2个字符。',
  }).max(100, {
        message: '写作风格不能超过100个字符。'
  }),
  initialChapterGoal: z.coerce.number().int().positive({
    message: '初始章节数必须是一个正整数。'
  }).min(1, {
      message: '初始章节数至少为1。'
  }).max(20, {
      message: '一次性最多生成20章。'
  }),
  totalChapterGoal: z.coerce.number().int().positive({
      message: '目标章节数必须是一个正整数。'
  }).min(1, {
      message: '目标章节数至少为1。'
  }).max(3000, {
      message: '目标章节数不能超过3000。'
  }),
  specialRequirements: z.string().max(2000, {
    message: '特殊要求不能超过2000个字符。'
  }).optional(),
});

export default function CreateNovelPage() {
  const router = useRouter();
  const { addNovel, generateNovelChapters, generationTask, generatedContent } = useNovelStore();
  const [submittedValues, setSubmittedValues] = useState<z.infer<typeof formSchema> | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      genre: '',
      style: '',
      initialChapterGoal: 5,
      totalChapterGoal: 200,
      specialRequirements: '',
    },
  });
  
  const isGenerating = generationTask.isActive;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setSubmittedValues(values);
    try {
      toast.info("正在创建小说设定...");
      const newNovelId = await addNovel(values);
      if (newNovelId) {
        toast.success("小说设定创建成功！正在启动生成引擎...");
        await generateNovelChapters(newNovelId, values.totalChapterGoal, values.initialChapterGoal);
        // Generation is complete, now we can show a success message and a button to navigate
      } else {
        throw new Error('创建小说失败，未能获取到ID。');
      }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        console.error("Failed to create novel:", errorMessage);
        toast.error(`创建失败: ${errorMessage}`);
    }
  }

  return (
    <div className="container mx-auto grid grid-cols-1 lg:grid-cols-3 gap-12 py-10">
      <div className="lg:col-span-2">
        {!isGenerating ? (
            <Card>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  <CardHeader>
                    <CardTitle className="text-2xl">创作新小说</CardTitle>
                    <CardDescription>
                      填写下面的信息，开始您的创作之旅。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>小说名称</FormLabel>
                          <FormControl>
                            <Input placeholder="例如：星际迷航：无限边疆" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="genre"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>题材类型</FormLabel>
                            <FormControl>
                              <Input placeholder="例如：科幻" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                          control={form.control}
                          name="style"
                          render={({ field }) => (
                              <FormItem>
                                  <FormLabel>写作风格</FormLabel>
                                  <FormControl>
                                      <Input placeholder="例如：赛博朋克" {...field} />
                                  </FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="initialChapterGoal"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>初始生成章节数</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        创建时生成的故事开篇章节数。
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                          control={form.control}
                          name="totalChapterGoal"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>目标总章节数</FormLabel>
                              <FormControl>
                                <Input type="number" {...field} />
                              </FormControl>
                              <FormDescription>
                                您计划完成的小说总章节数。
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                    </div>
                    <FormField
                          control={form.control}
                          name="specialRequirements"
                          render={({ field }) => (
                              <FormItem>
                                  <FormLabel>特殊要求</FormLabel>
                                  <FormControl>
                                      <Textarea
                                          placeholder="请描述您对小说的特殊要求，如特定情节、人物设定等..."
                                          className="resize-none"
                                          rows={5}
                                          {...field}
                                      />
                                  </FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                  </CardContent>
                  <CardFooter className="flex justify-start">
                    <Button type="submit" disabled={form.formState.isSubmitting} size="lg">
                        <Sparkles className="mr-2 h-4 w-4" />
                        开始生成
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            </Card>
        ) : (
            <>
              {submittedValues && (
                  <Card className="animate-fade-in">
                      <CardHeader>
                          <CardTitle className="flex items-center text-2xl">
                              <Bot className="mr-3 h-8 w-8 text-primary" />
                              正在为您构筑新世界...
                          </CardTitle>
                          <CardDescription>
                              AI引擎已启动，正在根据您的蓝图生成初始世界。请稍候片刻。
                          </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 text-sm">
                          <div className="flex items-center">
                              <Book className="h-5 w-5 mr-4 text-muted-foreground" />
                              <span className="font-semibold text-muted-foreground mr-2">小说名称:</span>
                              <span>{submittedValues.name}</span>
                          </div>
                          <div className="flex items-center">
                              <PencilRuler className="h-5 w-5 mr-4 text-muted-foreground" />
                              <span className="font-semibold text-muted-foreground mr-2">题材类型:</span>
                              <span>{submittedValues.genre}</span>
                          </div>
                          <div className="flex items-center">
                              <Gem className="h-5 w-5 mr-4 text-muted-foreground" />
                              <span className="font-semibold text-muted-foreground mr-2">写作风格:</span>
                              <span>{submittedValues.style}</span>
                          </div>
                           <div className="flex items-center">
                              <Workflow className="h-5 w-5 mr-4 text-muted-foreground" />
                              <span className="font-semibold text-muted-foreground mr-2">初始章节:</span>
                              <span>{submittedValues.initialChapterGoal} 章</span>
                          </div>
                          <div className="flex items-center">
                              <Target className="h-5 w-5 mr-4 text-muted-foreground" />
                              <span className="font-semibold text-muted-foreground mr-2">目标篇幅:</span>
                              <span>{submittedValues.totalChapterGoal} 章</span>
                          </div>
                          {submittedValues.specialRequirements && (
                              <div className="flex items-start">
                                  <Text className="h-5 w-5 mr-4 text-muted-foreground flex-shrink-0 mt-1" />
                                  <div>
                                      <span className="font-semibold text-muted-foreground">核心设定:</span>
                                      <p className="mt-1 leading-relaxed whitespace-pre-wrap">{submittedValues.specialRequirements}</p>
                                  </div>
                              </div>
                          )}
                      </CardContent>
                  </Card>
              )}

              {generationTask.currentStep.includes("正在生成第") && generatedContent && (
                  <Card className="mt-6 animate-fade-in">
                      <CardHeader>
                          <CardTitle>实时生成预览</CardTitle>
                          <CardDescription>{generationTask.currentStep}</CardDescription>
                      </CardHeader>
                      <CardContent>
                          <div className="prose prose-sm dark:prose-invert max-h-[400px] overflow-y-auto rounded-md border p-4 bg-muted/50">
                              <p className="whitespace-pre-wrap font-sans">{generatedContent}</p>
                          </div>
                      </CardContent>
                  </Card>
              )}
            </>
        )}
      </div>
      
      <div className="h-full">
        <GenerationProgress
            isActive={generationTask.isActive}
            currentStep={generationTask.currentStep}
            progress={generationTask.progress}
            novelId={generationTask.novelId}
            className="h-full" 
        />
      </div>
    </div>
  );
} 