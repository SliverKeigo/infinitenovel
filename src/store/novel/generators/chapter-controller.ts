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
import { extractFutureOutline, combineWithRevisedOutline } from "../utils/outline-utils";
import { Novel } from "@/types/novel";

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
  // --- 数据预加载 ---
  // 在执行任何操作之前，首先确保加载了最新的小说和章节数据
  set({ detailsLoading: true });
  await get().fetchNovelDetails(novelId);
  set({ detailsLoading: false });

  // --- 守望者逻辑 ---
  // 在开始任何生成工作前，先检查是否需要规划下一幕
  await get().checkForNextActPlanning(novelId);
  // --------------------

  const { chaptersToGenerate, userPrompt } = options;
  const currentNovel = get().currentNovel;
  if (!currentNovel) {
    toast.error("续写失败：无法获取小说信息。");
    return;
  }
  
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
    let currentChapterCount = currentNovel.chapter_count;

    for (let i = 0; i < chaptersToGenerate; i += BATCH_SIZE) {
      const currentBatchSize = Math.min(BATCH_SIZE, chaptersToGenerate - i);
      let batchGeneratedContent = "";
      const batchStartChapterNumber = currentChapterCount + 1;

      for (let j = 0; j < currentBatchSize; j++) {
        const overallProgress = Math.floor(((i + j) / chaptersToGenerate) * 100);
        
        // 获取下一个章节号
        const nextChapterNumber = currentChapterCount + 1;
        currentChapterCount++; // 更新当前章节计数

        set((state: any) => ({
          generationTask: {
            ...state.generationTask,
            progress: overallProgress,
            currentStep: `(第 ${i + j + 1}/${chaptersToGenerate} 章) 正在生成第 ${nextChapterNumber} 章...`
          }
        }));

        const promptForThisChapter = (i === 0 && j === 0) ? userPrompt : undefined;
        
        await get().expandPlotOutlineIfNeeded(novelId);
        
        const currentNovel = get().currentNovel;
        const characters = get().characters;
        const settings = useGenerationSettingsStore.getState().getSettings();
        if (!currentNovel || !settings) throw new Error("续写失败：无法获取小说信息或设置。");

        mutableOutline = currentNovel.plot_outline;
        
        if (typeof mutableOutline !== 'string') {
          console.error("[续写控制器] 严重错误：从状态中获取的 plotOutline 无效。", { currentNovel });
          throw new Error("获取续写大纲失败，大纲不是有效的字符串。");
        }

        const currentContext = { plotOutline: mutableOutline, characters, settings };
        await get().generateNewChapter(novelId, currentContext, promptForThisChapter, nextChapterNumber);
        const generatedContentForChapter = get().generatedContent;
        if (generatedContentForChapter) {
          // 在保存章节时传入正确的章节号
          await get().saveGeneratedChapter(novelId, nextChapterNumber);
          batchGeneratedContent += `\n\n--- 第 ${nextChapterNumber} 章 ---\n\n${generatedContentForChapter}`;
        } else {
          toast.warning(`第 ${nextChapterNumber} 章内容生成为空，任务中止。`);
          console.warn(`[续写控制器] 第 ${nextChapterNumber} 章内容生成为空，中止任务。`);
          i = chaptersToGenerate; // Break outer loop
          break; // Break inner loop
        }
      }

      if (batchGeneratedContent) {
        set((state: any) => ({
          generationTask: { ...state.generationTask, currentStep: `第 ${batchStartChapterNumber}-${batchStartChapterNumber + currentBatchSize - 1} 章批次完成，正在执行大纲动态修正...` }
        }));

        const novelForCycle = get().currentNovel as Novel;
        const nextChapterAfterBatch = currentChapterCount + 1;
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
          if (mutableOutline !== novelForCycle.plot_outline) {
            await fetch(`/api/novels/${novelId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ plot_outline: mutableOutline })
            });
          }
          get().fetchNovelDetails(novelId); // Refresh store with new outline
        } else {
        }
      }
    }

    if (get().generationTask.isActive) {
      await get().recordExpansion(novelId);
      toast.success(`${chaptersToGenerate > 1 ? `全部 ${chaptersToGenerate} 个` : ''}新章节已生成完毕！`);
      setTimeout(() => get().resetGenerationTask(), 1000);
    }

  } catch (error) {
    console.error("[续写控制器] 发生严重错误:", error);
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    toast.error(`续写时发生错误: ${errorMessage}`);
    setTimeout(() => get().resetGenerationTask(), 3000);
  } finally {
    set({ generationLoading: false });
  }
}; 