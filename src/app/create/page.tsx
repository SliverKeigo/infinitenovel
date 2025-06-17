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
import { Sparkles, Book, Bot, Gem, PencilRuler, Target, Text, Workflow, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";


const formSchema = z.object({
  name: z.string().min(2, {
    message: '小说名称至少需要2个字符。',
  }).max(50, {
      message: '小说名称不能超过50个字符。'
  }),
  genre: z.string().min(2, {
    message: '题材类型至少需要2个字符。',
  }).max(500, {
      message: '题材类型不能超过500个字符。'
  }),
  style: z.string().min(2, {
    message: '写作风格至少需要2个字符。',
  }).max(500, {
        message: '写作风格不能超过500个字符。'
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

type FormValues = z.infer<typeof formSchema>;

// 1. GenerationView Component: Isolates high-frequency re-renders.
const GenerationView = ({ submittedValues }: { submittedValues: FormValues }) => {
    const generationTask = useNovelStore(state => state.generationTask);
    const generatedContent = useNovelStore(state => state.generatedContent);

    return (
        <>
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

            {generationTask.currentStep.includes("生成第") && generatedContent && (
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
    );
}

export default function CreateNovelPage() {
  const router = useRouter();
  const addNovel = useNovelStore(state => state.addNovel);
  const generateNovelChapters = useNovelStore(state => state.generateNovelChapters);
  const isGenerating = useNovelStore(state => state.generationTask.isActive);
  const [submittedValues, setSubmittedValues] = useState<FormValues | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      genre: '',
      style: '',
      initialChapterGoal: 3,
      totalChapterGoal: 200,
      specialRequirements: '',
    },
  });

  // 处理JSON导入
  const handleImport = () => {
    try {
      // 尝试格式化输入的文本
      const formatJsonString = (input: string) => {
        // 清理输入文本，移除所有不可见的特殊字符
        const cleanInput = input
          .replace(/[\u200B-\u200D\uFEFF]/g, '') // 移除零宽字符
          .replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '') // 移除首尾空白和特殊空格
          .replace(/^`+|`+$/g, ''); // 移除反引号
        
        // 检查是否是有效的JSON格式
        if (!cleanInput.startsWith('{') || !cleanInput.endsWith('}')) {
          throw new Error('无效的JSON格式：必须以{开始，以}结束');
        }

        try {
          // 首先尝试直接解析
          return JSON.parse(cleanInput);
        } catch {
          try {
            // 如果直接解析失败，尝试处理多行文本
            const lines = cleanInput.split(/\r?\n/);
            let processedJson = '';
            let inString = false;

            // 逐行处理，保持字符串内的换行符
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              // 计算当前行中的引号数量（排除转义的引号）
              const quotes = line.match(/(?<!\\)"/g)?.length || 0;
              
              if (!inString) {
                // 不在字符串内
                processedJson += line;
                if (quotes % 2 !== 0) {
                  // 进入字符串
                  inString = true;
                }
              } else {
                // 在字符串内
                processedJson += '\\n' + line;
                if (quotes % 2 !== 0) {
                  // 退出字符串
                  inString = false;
                }
              }
            }

            console.log('处理后的JSON字符串:', processedJson);
            return JSON.parse(processedJson);
          } catch (e: unknown) {
            console.error('JSON处理失败:', e);
            throw new Error('JSON格式处理失败：' + (e instanceof Error ? e.message : String(e)));
          }
        }
      };

      const jsonData = formatJsonString(importText);
      console.log('解析后的数据:', jsonData);
      
      // 使用schema验证导入的数据
      const result = formSchema.safeParse({
        ...jsonData,
        initialChapterGoal: jsonData.initialChapterGoal || 3, // 设置默认值
      });

      if (result.success) {
        // 更新表单数据
        Object.entries(result.data).forEach(([key, value]) => {
          form.setValue(key as keyof FormValues, value);
        });
        setImportDialogOpen(false);
        setImportText('');
        toast.success('导入成功！');
      } else {
        console.error('Schema validation failed:', result.error);
        toast.error('导入的数据格式不正确，请检查必填字段。');
      }
    } catch (error: unknown) {
      console.error('JSON parsing error:', error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : 'JSON格式错误。请确保粘贴完整的JSON数据，包括开头的{和结尾的}。'
      );
    }
  };

  // 处理文件导入
  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImportText(e.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  async function onSubmit(values: FormValues) {
    setSubmittedValues(values);
    try {
      toast.info("正在创建小说设定...");
      
      // 构建完整的小说数据对象
      const novelData = {
        ...values,
        total_chapter_goal: values.totalChapterGoal, // 重命名以匹配数据库字段
        word_count: 0,                    // 初始字数为0
        chapter_count: 0,                 // 初始章节数为0
        character_count: 0,               // 初始角色数为0
        expansion_count: 0,               // 初始扩写次数为0
        plot_clue_count: 0,              // 初始线索数为0
        created_at: new Date(),          // 创建时间
        updated_at: new Date(),          // 更新时间
      };
      
      const newNovelId = await addNovel(novelData);
      if (newNovelId) {
        toast.success("小说设定创建成功！正在启动生成引擎...");
        await generateNovelChapters(newNovelId, values.totalChapterGoal, values.initialChapterGoal);
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
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="text-2xl">创作新小说</CardTitle>
                        <CardDescription>
                          填写下面的信息，开始您的创作之旅。
                        </CardDescription>
                      </div>
                      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="flex items-center gap-2">
                            <Upload className="h-4 w-4" />
                            导入配置
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>导入小说配置</DialogTitle>
                            <DialogDescription>
                              请粘贴JSON格式的小说配置，或选择一个JSON文件导入。
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Textarea
                              value={importText}
                              onChange={(e) => setImportText(e.target.value)}
                              placeholder="在此粘贴JSON配置..."
                              className="min-h-[200px] font-mono text-sm"
                            />
                            <div className="flex flex-col gap-4">
                              <Input
                                type="file"
                                accept=".json"
                                onChange={handleFileImport}
                                className="cursor-pointer"
                              />
                              <Button onClick={handleImport} className="w-full">
                                导入配置
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>小说名称</FormLabel>
                          <FormControl>
                            <Input placeholder="例如：迷雾之都的守夜人" {...field} />
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
                              <Input placeholder="例如：煤气灯幻想、悬疑推理" {...field} />
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
                                      <Input placeholder="例如：融合福尔摩斯与克苏鲁风格" {...field} />
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
                {submittedValues && <GenerationView submittedValues={submittedValues} />}
            </>
        )}
      </div>
      
      <div className="h-full">
        {/* GenerationProgress is already optimized to use selectors internally */}
        <GenerationProgress
            isActive={isGenerating}
            novelId={useNovelStore(state => state.generationTask.novelId)}
            currentStep={useNovelStore(state => state.generationTask.currentStep)}
            progress={useNovelStore(state => state.generationTask.progress)}
            mode={useNovelStore(state => state.generationTask.mode)}
            className="h-full" 
        />
      </div>
    </div>
  );
} 