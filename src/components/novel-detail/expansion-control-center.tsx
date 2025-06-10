'use client';

import { useState } from 'react';
import { useNovelStore } from '@/store/use-novel-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Sparkles } from 'lucide-react';
import { useGenerationSettingsStore } from "@/store/generation-settings";

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
    generateNewChapter,
    saveGeneratedChapter,
  } = useNovelStore();
  const { getSettings } = useGenerationSettingsStore();

  const handleGenerate = async () => {
    const novelId = currentNovel?.id;
    if (!novelId || !currentNovel?.plotOutline) {
        // Maybe show a toast notification that plot outline is required
        return;
    }
    
    const settings = await getSettings();
    if (!settings) {
        // Maybe show a toast notification that settings are required
        return;
    }

    const context = {
        plotOutline: currentNovel.plotOutline,
        characters: characters,
        settings: settings,
    };
    
    generateNewChapter(novelId, context, userPrompt);
  };

  const handleSave = () => {
    const novelId = currentNovel?.id;
    if (!novelId) return;
    saveGeneratedChapter(novelId).then(() => {
      onClose(); // 保存成功后关闭控制中心
    });
  };

  const buttonText = userPrompt.trim() ? '根据我的要求生成' : '让 Agent 自动续写';

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
          disabled={generationLoading}
        />
        <Button onClick={handleGenerate} disabled={generationLoading} className="w-full">
          {generationLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              AI 思考中...
            </>
          ) : (
            buttonText
          )}
        </Button>
        
        {generatedContent && (
            <Alert>
                <AlertTitle>生成结果预览</AlertTitle>
                <AlertDescription className="mt-2">
                    <div className="max-h-60 overflow-y-auto rounded-md border bg-muted p-4 whitespace-pre-wrap font-sans">
                        {generatedContent}
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                         <Button variant="outline" onClick={onClose}>取消</Button>
                         <Button onClick={handleSave}>接受并保存</Button>
                    </div>
                </AlertDescription>
            </Alert>
        )}
      </CardContent>
    </Card>
  );
}; 