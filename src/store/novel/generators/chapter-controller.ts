/**
 * 章节批量生成控制模块
 */
import { toast } from "sonner";
import { useGenerationSettingsStore } from '@/store/generation-settings';
import type { Character } from '@/types/character';
import type { GenerationSettings } from '@/types/generation-settings';

/**
 * 批量生成章节的控制函数
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 * @param novelId - 小说ID
 * @param context - 生成上下文
 * @param options - 生成选项
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
  const { chaptersToGenerate, userPrompt } = options;
  
  set({
    generationTask: {
      isActive: true,
      progress: 0,
      currentStep: `准备生成 ${chaptersToGenerate} 个新章节...`,
      novelId,
      mode: 'continue', // 设置为continue模式，表示这是续写现有小说
    },
    generationLoading: true,
    generatedContent: null, // Reset content view
  });

  try {
    for (let i = 0; i < chaptersToGenerate; i++) {
      const progress = (i / chaptersToGenerate) * 100;
      // The number of the chapter we are about to generate
      const nextChapterNumber = (get().chapters.length || 0) + 1;

      set((state: any) => ({
        generationTask: {
          ...state.generationTask,
          progress: Math.floor(progress),
          currentStep: `(第 ${i + 1}/${chaptersToGenerate} 章) 正在生成第 ${nextChapterNumber} 章...`
        }
      }));

      // Only use the user prompt for the very first chapter of this batch
      const promptForThisChapter = i === 0 ? userPrompt : undefined;

      // Step 1: Check and expand plot outline if needed.
      await get().expandPlotOutlineIfNeeded(novelId);

      // Step 2: Refetch the latest context, as outline might have changed.
      const currentNovel = get().currentNovel;
      const characters = get().characters;
      const settings = await useGenerationSettingsStore.getState().getSettings();

      if (!currentNovel || !currentNovel.plotOutline || !settings) {
        throw new Error("续写失败：无法获取必要的小说信息或设置。");
      }

      const currentContext = {
        plotOutline: currentNovel.plotOutline,
        characters: characters,
        settings: settings,
      };

      // Step 3: Generate the new chapter content.
      await get().generateNewChapter(novelId, currentContext, promptForThisChapter, nextChapterNumber);

      // Step 4: Save the generated chapter.
      if (get().generatedContent) {
        await get().saveGeneratedChapter(novelId);
      } else {
        toast.warning(`第 ${nextChapterNumber} 章内容生成为空，续写任务已中止。`);
        break;
      }
    }

    if (get().generationTask.isActive) { // Check if it wasn't aborted
      await get().recordExpansion(novelId); // Record one expansion for the whole batch.
      toast.success(`${chaptersToGenerate > 1 ? `全部 ${chaptersToGenerate} 个` : ''}新章节已生成完毕！`);
      set((state: any) => ({
        generationTask: {
          ...state.generationTask,
          isActive: false,
          progress: 100,
          currentStep: '续写任务完成！'
        }
      }));
      
      // 延迟1秒后重置状态，确保用户能看到完成消息
      setTimeout(() => {
        get().resetGenerationTask();
      }, 1000);
    }

  } catch (error) {
    console.error("An error occurred during the chapter generation process:", error);
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    toast.error(`续写章节时发生错误: ${errorMessage}`);
    set((state: any) => ({
      generationTask: {
        ...state.generationTask,
        isActive: false,
        currentStep: `续写失败: ${errorMessage}`,
      },
    }));
    
    // 延迟3秒后重置状态，确保用户能看到错误消息
    setTimeout(() => {
      get().resetGenerationTask();
    }, 3000);
  } finally {
    set({ generationLoading: false });
  }
}; 