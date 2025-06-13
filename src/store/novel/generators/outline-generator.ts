/**
 * 大纲生成和扩展相关的函数
 */

import { db } from '@/lib/db';
import { useAIConfigStore } from '@/store/ai-config';
import OpenAI from 'openai';
import { toast } from "sonner";
import { countDetailedChaptersInOutline } from '../outline-utils';
import { getGenreStyleGuide } from '../style-guides';
import { OUTLINE_EXPAND_THRESHOLD, OUTLINE_EXPAND_CHUNK_SIZE } from '../constants';

/**
 * 如果需要，扩展小说大纲
 * @param get - Zustand的get函数
 * @param novelId - 小说ID
 * @param force - 是否强制扩展，即使未达到阈值也扩展
 */
export const expandPlotOutlineIfNeeded = async (
  get: () => any,
  novelId: number, 
  force = false
) => {
  const { activeConfigId } = useAIConfigStore.getState();
  const activeConfig = activeConfigId ? await db.aiConfigs.get(activeConfigId) : null;
  const novel = await db.novels.get(novelId);

  if (!novel || !activeConfig || !activeConfig.apiKey || !novel.plotOutline) {
    console.warn("无法扩展大纲：缺少小说、有效配置或现有大纲。");
    return;
  }

  const currentChapterCount = novel.chapterCount;
  const detailedChaptersInOutline = countDetailedChaptersInOutline(novel.plotOutline);

  console.log(`扩展检查：当前章节 ${currentChapterCount}, 大纲中章节 ${detailedChaptersInOutline}`);

  if (detailedChaptersInOutline >= novel.totalChapterGoal) {
    console.log("大纲已完成，无需扩展。");
    return;
  }

  if (force || detailedChaptersInOutline - currentChapterCount < OUTLINE_EXPAND_THRESHOLD) {
    toast.info("AI正在思考后续情节，请稍候...");
    console.log("触发大纲扩展...");

    const openai = new OpenAI({
      apiKey: activeConfig.apiKey,
      baseURL: activeConfig.apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    // 获取基于小说类型的风格指导
    const styleGuide = getGenreStyleGuide(novel.genre, novel.style);

    const expansionPrompt = `
        你是一位正在续写自己史诗级作品《${novel.name}》的小说家。
        
        ${styleGuide}
        
        这是我们共同确定的、贯穿整个故事的宏观篇章规划和已有的详细大纲：
        ---
        ${novel.plotOutline}
        ---
        任务: 
        我们已经完成了前 ${currentChapterCount} 章的创作。现在，请你基于已有的宏观规划和剧情，为故事紧接着生成从第 ${detailedChaptersInOutline + 1} 章到第 ${detailedChaptersInOutline + OUTLINE_EXPAND_CHUNK_SIZE} 章的详细剧情摘要。
        
        请确保新的细纲与前面的剧情无缝衔接，并稳步推进核心情节。
        请只返回新增的这 ${OUTLINE_EXPAND_CHUNK_SIZE} 章细纲，格式为"第X章: [剧情摘要]"，不要重复任何已有内容或添加额外解释。
        
        请特别注意：
        1. 每个章节的剧情摘要应该遵循上面的风格指南，确保风格一致性
        2. 避免剧情过于平淡或重复，每个章节都应该有新的发展或转折
        3. 角色行为要符合其已建立的性格特点
        4. 确保新增章节与整体故事弧线保持一致
      `;

    try {
      const response = await openai.chat.completions.create({
        model: activeConfig.model,
        messages: [{ role: 'user', content: expansionPrompt }],
        temperature: 0.6,
      });

      const newOutlinePart = response.choices[0].message.content;
      if (newOutlinePart) {
        const updatedOutline = `${novel.plotOutline}\n${newOutlinePart.trim()}`;
        await db.novels.update(novel.id!, { plotOutline: updatedOutline });
        // 更新 Zustand store 中的 currentNovel
        const currentNovel = get().currentNovel;
        if (currentNovel && currentNovel.id === novel.id) {
          await get().fetchNovelDetails(novel.id!);
        }
        toast.success("AI已构思好新的情节！");
        console.log("大纲扩展成功！");
      }
    } catch (error) {
      console.error("扩展大纲失败:", error);
      toast.error("AI构思后续情节时遇到了点麻烦...");
    }
  }
};

/**
 * 强制扩展大纲
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 * @param novelId - 小说ID
 */

export const forceExpandOutline = async (
  get: () => any,
  set: (partial: any) => void,
  novelId: number
) => {
  set({ generationLoading: true });
  toast.info("正在强制扩展大纲...");
  try {
    await expandPlotOutlineIfNeeded(get, novelId, true);
  } catch (error) {
    console.error("强制扩展大纲失败:", error);
    toast.error(`强制扩展大纲时出错: ${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    set({ generationLoading: false });
  }
}; 