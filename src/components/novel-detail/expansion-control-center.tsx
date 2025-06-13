'use client';

import { useState } from 'react';
import { useNovelStore } from '@/store/use-novel-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Sparkles, CheckCircle } from 'lucide-react';
import { useGenerationSettingsStore } from "@/store/generation-settings";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ExpansionControlCenterProps {
  onClose: () => void;
}

export const ExpansionControlCenter = ({ onClose }: ExpansionControlCenterProps) => {
  const [userPrompt, setUserPrompt] = useState('');
  const [chaptersToGenerate, setChaptersToGenerate] = useState(1);

  const currentNovel = useNovelStore(state => state.currentNovel);
  const characters = useNovelStore(state => state.characters);
  const generationLoading = useNovelStore(state => state.generationLoading);
  const generationTask = useNovelStore(state => state.generationTask);
  const generatedContent = useNovelStore(state => state.generatedContent);
  const generateChapters = useNovelStore(state => state.generateChapters);
  const resetGenerationTask = useNovelStore(state => state.resetGenerationTask);
  const forceExpandOutline = useNovelStore(state => state.forceExpandOutline);
  
  const { getSettings } = useGenerationSettingsStore();

  const handleGenerate = async () => {
    const novelId = currentNovel?.id;
    if (!novelId || !currentNovel?.plotOutline) {
      toast.error("缺少小说ID或故事大纲，无法生成。");
      return;
    }
    
    const settings = await getSettings();
    if (!settings) {
      toast.error("生成设置未找到，请在设置页面配置。");
      return;
    }

    const context = {
        plotOutline: currentNovel.plotOutline,
        characters: characters,
        settings: settings,
    };
    
    await generateChapters(novelId, context, { chaptersToGenerate, userPrompt });
  };

  const handleForceExpand = async () => {
    const novelId = currentNovel?.id;
    if (!novelId) {
      toast.error("缺少小说ID，无法扩展大纲。");
      return;
    }
    await forceExpandOutline(novelId);
  };

  const buttonText = `让 Agent 自动续写 ${chaptersToGenerate > 1 ? `${chaptersToGenerate} 章` : ''}`.trim();
  const userPromptButtonText = `根据我的要求生成 ${chaptersToGenerate > 1 ? `${chaptersToGenerate} 章` : '新章节'}`.trim();

  const isProcessFinished = !generationLoading && generationTask.isActive && (
    generationTask.currentStep.includes('完成') || 
    generationTask.currentStep.includes('完毕') || 
    generationTask.currentStep.includes('失败')
  );

  const getDisplayStep = (step: string): string => {
    if (step && step.includes('场景')) {
      const chapterPart = step.split(' - ')[0];
      if (chapterPart) {
        return `${chapterPart}...`;
      }
    }
    return step;
  };

  return (
    <Card className="border-primary/20 border-2 shadow-lg my-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          <span>续写控制中心</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
        <Textarea
          placeholder="请输入你对下一章的具体要求、情节走向或关键对话..."
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          rows={5}
          disabled={generationLoading || isProcessFinished}
            className="flex-grow"
        />
          <Button 
            onClick={handleForceExpand} 
            disabled={generationLoading && generationTask.isActive} 
            variant="outline"
            className="self-start"
          >
            修复大纲
          </Button>
        </div>
        <div className="flex items-center gap-4">
            <div className="w-24 flex-shrink-0">
                <Label htmlFor="chapters-to-generate" className="text-sm font-medium">生成章数</Label>
                <Input
                    id="chapters-to-generate"
                    type="number"
                    value={chaptersToGenerate}
                    onChange={(e) => setChaptersToGenerate(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full mt-1"
                    disabled={generationLoading && generationTask.isActive}
                    min="1"
                />
            </div>
            <Button onClick={handleGenerate} disabled={generationLoading && generationTask.isActive} className="w-full mt-6">
          {generationLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {getDisplayStep(generationTask.currentStep) || 'AI 思考中...'}
            </>
          ) : isProcessFinished ? (
             <>
                <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                已保存！
             </>
          ) : (
                userPrompt.trim() ? userPromptButtonText : buttonText
          )}
        </Button>
        </div>
        
        {generationLoading && generatedContent && (
            <Alert>
                <AlertTitle>实时生成预览</AlertTitle>
                <AlertDescription className="mt-2">
                    <div className="max-h-60 overflow-y-auto rounded-md border bg-muted p-4 whitespace-pre-wrap font-sans">
                        {generatedContent}
                    </div>
                </AlertDescription>
            </Alert>
        )}

        {isProcessFinished && (
             <div className="flex justify-end gap-2 mt-4">
                 <Button onClick={onClose}>完成并关闭</Button>
                 <Button onClick={() => { setUserPrompt(''); resetGenerationTask(); }} variant="ghost">继续创作</Button>
             </div>
        )}
      </CardContent>
    </Card>
  );
}; 