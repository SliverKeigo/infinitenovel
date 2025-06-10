'use client';

import {
  BookText,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Sparkles,
  Users,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from "@/lib/utils";

const steps = [
  {
    name: '初始化任务',
    status: '生成任务已启动',
    state: 'completed',
    icon: CheckCircle2,
  },
  {
    name: '创建大纲',
    status: '正在创建大纲...',
    state: 'active',
    icon: Loader2,
  },
  {
    name: '创建人物',
    status: '等待中...',
    state: 'waiting',
    icon: Users,
  },
  {
    name: '生成章节',
    status: '等待中...',
    state: 'waiting',
    icon: BookText,
  },
  {
    name: '完成生成',
    status: '等待中...',
    state: 'waiting',
    icon: CircleDashed,
  },
];

type GenerationProgressProps = {
    className?: string;
}

export function GenerationProgress({ className }: GenerationProgressProps) {
  const activeStepIndex = steps.findIndex((step) => step.state === 'active');
  const progressPercentage = activeStepIndex > -1 ? (activeStepIndex / (steps.length - 1)) * 100 : 0;

  return (
    <Card className={cn("sticky top-24 flex flex-col", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span>生成进度</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow space-y-4 flex flex-col justify-between">
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.name}
              className={cn(
                'flex items-start gap-4 rounded-lg p-3 transition-colors',
                step.state === 'completed' && 'bg-green-50 text-green-800',
                step.state === 'active' && 'bg-blue-50 text-blue-800',
                step.state === 'waiting' && 'bg-muted/60'
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full',
                  step.state === 'completed' && 'bg-green-100',
                  step.state === 'active' && 'bg-blue-100',
                  step.state === 'waiting' && 'bg-background'
                )}
              >
                <step.icon
                  className={cn(
                    'h-5 w-5',
                    step.state === 'waiting' && 'text-muted-foreground',
                    step.state === 'active' && 'animate-spin'
                  )}
                />
              </div>
              <div>
                <p className="font-semibold">{step.name}</p>
                <p className="text-sm">{step.status}</p>
              </div>
            </div>
          ))}
        </div>
         <div className="space-y-2 pt-2">
            <Progress value={progressPercentage} />
            <p className="text-sm text-center text-muted-foreground">
              {steps[activeStepIndex]?.status || '...'}
            </p>
         </div>
      </CardContent>
    </Card>
  );
} 