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

interface ExpansionControlCenterProps {
  onClose: () => void;
}

export const ExpansionControlCenter = ({ onClose }: ExpansionControlCenterProps) => {
  const [userPrompt, setUserPrompt] = useState('');
  const {
    currentNovel,
    characters,
    generationLoading,
    generatedContent,
    generateAndSaveNewChapter,
  } = useNovelStore();
  const { getSettings } = useGenerationSettingsStore();
  const [isSuccessfullySaved, setIsSuccessfullySaved] = useState(false);

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
    
    setIsSuccessfullySaved(false);
    await generateAndSaveNewChapter(novelId, context, userPrompt);
    // After generation and saving are complete, update the state
    // We check generationLoading to ensure we only set success state when the process truly ends.
    if (!useNovelStore.getState().generationLoading) {
        setIsSuccessfullySaved(true);
    }
  };

  const buttonText = userPrompt.trim() ? '根据我的要求生成' : '让 Agent 自动续写';

  // This will re-render when the generation process is fully complete
  const isProcessFinished = !generationLoading && isSuccessfullySaved;

  return (
    <Card className="border-primary/20 border-2 shadow-lg my-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          <span>续写控制中心</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="请输入你对下一章的具体要求、情节走向或关键对话..."
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          rows={5}
          disabled={generationLoading || isProcessFinished}
        />
        <Button onClick={handleGenerate} disabled={generationLoading || isProcessFinished} className="w-full">
          {generationLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              AI 思考中 (内容流式预览)...
            </>
          ) : isProcessFinished ? (
             <>
                <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                已保存！
             </>
          ) : (
            buttonText
          )}
        </Button>
        
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
                 <Button onClick={() => setIsSuccessfullySaved(false)} variant="ghost">继续创作</Button>
             </div>
        )}
      </CardContent>
    </Card>
  );
}; 