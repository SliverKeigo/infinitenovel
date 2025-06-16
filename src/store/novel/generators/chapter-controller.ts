/**
 * 章节批量生成控制模块
 */
import { toast } from "sonner";
import { useGenerationSettingsStore } from '@/store/generation-settings';
import type { Character } from '@/types/character';
import type { GenerationSettings } from '@/types/generation-settings';
import OpenAI from "openai";
import { useAIConfigStore } from "@/store/ai-config";
import { runOutlineUpdateCycle } from "./outline-updater";
import { extractFutureOutline, combineWithRevisedOutline } from "../outline-utils";

const BATCH_SIZE = 5; // 每5章执行一次大纲修正

/**
 * 批量生成章节的智能控制函数
 */
export const generateChapters = async (
  get: () => any,
  set: (partial: any) => void,
  novelId: number,
  context: {
    plotOutline: string;
    characters: Character[];
    settings: GenerationSettings;
  },
  options: {
    chaptersToGenerate: number;
    userPrompt?: string;
  }
) => {
  // --- 守望者逻辑 ---
  // 在开始任何生成工作前，先检查是否需要规划下一幕
  await get().checkForNextActPlanning(novelId);
  // --------------------

  const { chaptersToGenerate, userPrompt } = options;
  
  set({
    generationTask: {
      isActive: true,
      progress: 0,
      currentStep: `准备生成 ${chaptersToGenerate} 个新章节...`,
      novelId,
      mode: 'continue',
    },
    generationLoading: true,
    generatedContent: null,
  });

  try {
    const { configs, activeConfigId } = useAIConfigStore.getState();
    if (!activeConfigId) throw new Error("没有激活的AI配置。");
    const activeConfig = configs.find(c => c.id === activeConfigId);
    if (!activeConfig || !activeConfig.api_key) throw new Error("有效的AI配置未找到或API密钥缺失。");
    
      const openai = new OpenAI({
        apiKey: activeConfig.api_key,
        baseURL: activeConfig.api_base_url || undefined,
        dangerouslyAllowBrowser: true,
      });

    let mutableOutline = context.plotOutline;

    for (let i = 0; i < chaptersToGenerate; i += BATCH_SIZE) {
      const currentBatchSize = Math.min(BATCH_SIZE, chaptersToGenerate - i);
      let batchGeneratedContent = "";
      const batchStartChapterNumber = (get().chapters.length || 0) + 1;

      for (let j = 0; j < currentBatchSize; j++) {
        const overallProgress = ((i + j) / chaptersToGenerate) * 100;
        
        // 获取下一个章节号
        const nextChapterNumber = await get().getMaxChapterNumber(novelId) + 1;

        set((state: any) => ({
          generationTask: {
            ...state.generationTask,
            progress: Math.floor(overallProgress),
            currentStep: `(第 ${i + j + 1}/${chaptersToGenerate} 章) 正在生成第 ${nextChapterNumber} 章...`
          }
        }));

        const promptForThisChapter = (i === 0 && j === 0) ? userPrompt : undefined;
        
        await get().expandPlotOutlineIfNeeded(novelId);
        
        const currentNovel = get().currentNovel;
        const characters = get().characters;
        const settings = await useGenerationSettingsStore.getState().getSettings();
        if (!currentNovel || !settings) throw new Error("续写失败：无法获取小说信息或设置。");

        mutableOutline = currentNovel.plotOutline;

        const currentContext = { plotOutline: mutableOutline, characters, settings };
        await get().generateNewChapter(novelId, currentContext, promptForThisChapter, nextChapterNumber);
        const generatedContentForChapter = get().generatedContent;
        if (generatedContentForChapter) {
          // 在保存章节时传入正确的章节号
          await get().saveGeneratedChapter(novelId, nextChapterNumber);
          batchGeneratedContent += `\n\n--- 第 ${nextChapterNumber} 章 ---\n\n${generatedContentForChapter}`;
        } else {
          toast.warning(`第 ${nextChapterNumber} 章内容生成为空，任务中止。`);
          i = chaptersToGenerate; // Break outer loop
          break; // Break inner loop
        }
      }

      if (batchGeneratedContent) {
        set((state: any) => ({
          generationTask: { ...state.generationTask, currentStep: `第 ${batchStartChapterNumber}-${batchStartChapterNumber + currentBatchSize - 1} 章批次完成，正在执行大纲动态修正...` }
        }));

        const novelForCycle = get().currentNovel;
        const nextChapterAfterBatch = (get().chapters.length || 0) + 1;
        const futureOutline = extractFutureOutline(mutableOutline, nextChapterAfterBatch);

        if (futureOutline && novelForCycle) {
          const revisedFutureOutline = await runOutlineUpdateCycle(
            novelForCycle,
            batchGeneratedContent,
            futureOutline,
            openai,
            batchStartChapterNumber
          );

          mutableOutline = combineWithRevisedOutline(mutableOutline, revisedFutureOutline, nextChapterAfterBatch);
          if (mutableOutline !== novelForCycle.plotOutline) {
            await fetch(`/api/novels/${novelId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ plot_outline: mutableOutline })
            });
          }
          get().fetchNovelDetails(novelId); // Refresh store with new outline
          console.log("大纲已动态修正并更新。");
        }
      }
    }

    if (get().generationTask.isActive) {
      await get().recordExpansion(novelId);
      toast.success(`${chaptersToGenerate > 1 ? `全部 ${chaptersToGenerate} 个` : ''}新章节已生成完毕！`);
      setTimeout(() => get().resetGenerationTask(), 1000);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    toast.error(`续写时发生错误: ${errorMessage}`);
    setTimeout(() => get().resetGenerationTask(), 3000);
  } finally {
    set({ generationLoading: false });
  }
}; 