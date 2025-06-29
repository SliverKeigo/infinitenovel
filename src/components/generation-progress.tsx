'use client';

import {
  BookText,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Sparkles,
  Users,
  FileText,
  Wand2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from "@/lib/utils";
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const generationSteps = [
  { name: '创建大纲', progressThreshold: 0 },
  { name: '创建人物', progressThreshold: 20 },
  { name: '生成章节', progressThreshold: 40 },
  { name: '完成生成', progressThreshold: 100 },
];

type GenerationProgressProps = {
    className?: string;
    isActive: boolean;
    currentStep: string;
    progress: number;
    novelId: number | null;
    mode?: 'create' | 'continue' | 'idle';
}

export function GenerationProgress({ 
    className, 
    isActive, 
    currentStep, 
    progress, 
    novelId,
    mode = 'idle'
}: GenerationProgressProps) {
  const pathname = usePathname();
  
  if (!isActive) {
      return (
         <Card className={cn("sticky top-24 flex flex-col items-center justify-center", className)}>
             <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-muted-foreground" />
                    <span>生成任务</span>
                </CardTitle>
            </CardHeader>
             <CardContent className="text-center">
                 <p className="text-muted-foreground">填写左侧表单，开始你的创作之旅。</p>
             </CardContent>
         </Card>
      )
  }

  if ((mode === 'create' && currentStep.includes('第') && currentStep.includes('章')) || 
      (mode === 'continue' && pathname.includes('/create'))) {
    return (
      <Card className={cn("sticky top-24 flex flex-col items-center justify-center", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <span>创建新小说</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground">填写左侧表单，开始你的创作之旅。</p>
          {mode === 'continue' && (
            <p className="text-xs text-amber-500 mt-2">
              提示：您有一个续写任务正在进行中，请返回小说详情页查看。
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const isCompleted = progress === 100;

  return (
    <Card className={cn("sticky top-24 flex flex-col", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            {isCompleted ? (
                 <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
                <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            )}
          <span>{isCompleted ? "生成完成" : "正在生成中..."}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow space-y-4 flex flex-col justify-between">
        <div className="space-y-3">
          {generationSteps.map((step, index) => {
            const nextStepThreshold = generationSteps[index + 1]?.progressThreshold || 100;

            const isStepActive = !isCompleted && progress >= step.progressThreshold && progress < nextStepThreshold;
            const isStepCompleted = isCompleted || progress >= nextStepThreshold;
            
            let status: 'waiting' | 'active' | 'completed' = 'waiting';
            if (isStepActive) {
                status = 'active';
            } else if (isStepCompleted) {
                status = 'completed';
            }

            return (
                <div
                    key={step.name}
                    className={cn(
                        'flex items-start gap-4 rounded-lg p-3 transition-colors',
                        status === 'completed' && 'bg-green-50 text-green-800',
                        status === 'active' && 'bg-blue-50 text-blue-800',
                        status === 'waiting' && 'bg-muted/60'
                    )}
                >
                    <div
                        className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            status === 'completed' && 'bg-green-100',
                            status === 'active' && 'bg-blue-100',
                            status === 'waiting' && 'bg-background'
                        )}
                    >
                         {status === 'completed' ? <CheckCircle2 className="h-5 w-5" /> : (status === 'active' ? <Loader2 className="h-5 w-5 animate-spin" /> : <CircleDashed className="h-5 w-5 text-muted-foreground" />)}
                    </div>
                    <div>
                        <p className="font-semibold">{step.name}</p>
                        <p className="text-sm">{status === 'active' ? currentStep : (status === 'completed' ? "已完成" : "等待中...")}</p>
                    </div>
                </div>
            )
          })}
        </div>
         <div className="space-y-2 pt-2">
            <Progress value={progress} />
            <p className="text-sm text-center text-muted-foreground">
              总进度: {progress.toFixed(0)}%
            </p>
         </div>
         {isCompleted && novelId && (
            <div className="pt-4">
                 <Link href={`/manage/${novelId}`} passHref>
                    <Button className="w-full" size="lg">查看小说</Button>
                </Link>
            </div>
         )}
      </CardContent>
    </Card>
  );
}

export const GenerationProgressPlaceholder = ({ className }: GenerationProgressProps) => {
    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Wand2 className="h-6 w-6 text-primary animate-pulse" />
                    <span>正在为您构建小说世界...</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center text-center space-y-4 pt-10">
                <Loader2 className="h-16 w-16 animate-spin text-primary/50" />
                <div className="space-y-1">
                    <p className="font-semibold">AI 正在努力工作中</p>
                    <p className="text-sm text-muted-foreground">
                        正在创建小说设定、生成开篇章节...
                    </p>
                     <p className="text-xs text-muted-foreground pt-4">
                        完成后将自动跳转，请稍候。
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}; 