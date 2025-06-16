/**
 * 大纲生成和扩展相关的函数
 */

import { useAIConfigStore } from '@/store/ai-config';
import OpenAI from 'openai';
import { toast } from "sonner";
import { countDetailedChaptersInOutline, extractChapterNumbers } from '../outline-utils';
import { getGenreStyleGuide } from '../style-guides';
import { getOrCreateStyleGuide } from './style-guide-generator';
import { processOutline, extractDetailedAndMacro } from '../parsers';
import { OUTLINE_EXPAND_THRESHOLD, OUTLINE_EXPAND_CHUNK_SIZE } from '../constants';
import { getOrCreateCharacterRules } from './character-rules-generator';
import { useNovelStore } from '@/store/use-novel-store';
import { Novel } from '@/types/novel';

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
  const { configs, activeConfigId } = useAIConfigStore.getState();
  const activeConfig = activeConfigId ? configs.find(c => c.id === activeConfigId) : null;
  const novelResponse = await fetch(`/api/novels/${novelId}`);
  if (!novelResponse.ok) {
    throw new Error("获取小说信息失败");
  }
  const novel = await novelResponse.json() as Novel;

  if (!novel || !activeConfig || !activeConfig.api_key || !novel.plot_outline) {
    console.warn("无法扩展大纲：缺少小说、有效配置或现有大纲。");
    return;
  }

  const currentChapterCount = novel.chapter_count;
  
  // 只计算章节部分的详细章节数量
  const { detailed: chapterOnlyOutline } = extractDetailedAndMacro(novel.plot_outline);
  console.log(`[大纲扩展] 提取到的章节部分长度: ${chapterOnlyOutline.length} 字符`);
  
  // 输出章节部分的前200个字符，帮助诊断
  console.log(`[大纲扩展] 章节部分前200字符: ${chapterOnlyOutline.substring(0, 200)}...`);
  
  const detailedChaptersInOutline = countDetailedChaptersInOutline(chapterOnlyOutline);

  console.log(`扩展检查：当前章节 ${currentChapterCount}, 大纲中章节 ${detailedChaptersInOutline}`);

  if (detailedChaptersInOutline >= novel.total_chapter_goal) {
    console.log("大纲已完成，无需扩展。");
    return;
  }

  if (force || detailedChaptersInOutline - currentChapterCount < OUTLINE_EXPAND_THRESHOLD) {
    toast.info("AI正在思考后续情节，请稍候...");
    console.log("触发大纲扩展...");
    
    // 记录扩展前的章节数量，用于后续比较
    console.log(`[大纲扩展] 扩展前大纲包含 ${detailedChaptersInOutline} 个章节`);
    console.log(`[大纲扩展] 计划新增 ${OUTLINE_EXPAND_CHUNK_SIZE} 个章节，从第 ${detailedChaptersInOutline + 1} 章开始`);

    const openai = new OpenAI({
      apiKey: activeConfig.api_key,
      baseURL: activeConfig.api_base_url || undefined,
      dangerouslyAllowBrowser: true,
    });

    // 获取风格指导，优先使用保存的定制风格指导
    let styleGuide = "";
    try {
      // 尝试获取或创建定制风格指导
      console.log("[大纲扩展] 正在获取风格指导");
      styleGuide = await getOrCreateStyleGuide(novelId);
      console.log("[大纲扩展] 成功获取风格指导");
    } catch (error) {
      // 如果获取失败，回退到默认风格指导
      console.error("[大纲扩展] 获取定制风格指导失败，使用默认风格指导:", error);
      styleGuide = getGenreStyleGuide(novel.genre, novel.style);
    }

    // [新增] 获取角色行为准则
    const characterRules = await getOrCreateCharacterRules(novelId);

    // 仅使用章节部分进行扩展
    const expansionPrompt = `
        【输出格式要求】
        请直接输出新增章节大纲内容，不要包含任何前缀说明或额外格式解释。
        
        【大纲扩展任务】
        你是一位正在续写自己史诗级作品《${novel.name}》的小说家。
        
        ${styleGuide}
        ${characterRules}
        
        这是我们已有的详细章节大纲（前 ${detailedChaptersInOutline} 章）：
        ---
        ${chapterOnlyOutline}
        ---
        
        任务: 
        我们已经完成了前 ${currentChapterCount} 章的创作。现在，请你基于已有的剧情，为故事紧接着生成从第 ${detailedChaptersInOutline + 1} 章到第 ${detailedChaptersInOutline + OUTLINE_EXPAND_CHUNK_SIZE} 章的详细剧情摘要。
        
        请遵循以下要求：
        1. 新的大纲必须与前面的剧情无缝衔接，并稳步推进核心情节
        2. 每章大纲的字数控制在50-100字左右，简明扼要地概括核心事件
        3. 每个章节只描述1-2个关键事件，禁止在单个章节中安排过多内容
        4. 请只返回新增的这 ${OUTLINE_EXPAND_CHUNK_SIZE} 章细纲，格式为"第X章: [剧情摘要]"
        5. 不要重复任何已有内容或添加额外解释
        
        请保持故事的连贯性和风格一致性，确保每个章节都有明确的目标和冲突。
      `;

    try {
      const apiResponse = await fetch('/api/ai/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeConfigId: activeConfig.id,
          model: activeConfig.model,
          messages: [{ role: 'user', content: expansionPrompt }],
          temperature: 0.6,
        }),
      });

      if (!apiResponse.ok) {
        throw new Error(`API request failed: ${await apiResponse.text()}`);
      }
      const response = await apiResponse.json();

      let expandedContent = response.choices[0].message.content || "";
      
      // 清理AI返回的markdown
      expandedContent = expandedContent.replace(/^#+\s+/, '').replace(/\n\n+/, '\n\n');
      
      // 处理新增大纲，确保格式正确
      const processedNewPart = processOutline(expandedContent);
      console.log(`[大纲扩展] 新增大纲部分 (处理前 ${expandedContent.length} 字符, 处理后 ${processedNewPart.length} 字符)`);
      
      // 将新增内容与原大纲结合
      const updatedOutline = `${novel.plot_outline}\n\n${processedNewPart.trim()}`;
      await fetch(`/api/novels/${novelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plot_outline: updatedOutline })
      });
      
      // 验证扩展后的章节数量
      const { detailed: updatedChapterOnlyOutline } = extractDetailedAndMacro(updatedOutline);
      const updatedChapterCount = countDetailedChaptersInOutline(updatedChapterOnlyOutline);
      console.log(`[大纲扩展] 扩展后大纲包含 ${updatedChapterCount} 个章节，理论上应有 ${detailedChaptersInOutline + OUTLINE_EXPAND_CHUNK_SIZE} 个章节`);
      
      // 提取扩展后的章节编号，确认新章节已添加
      const chapterNumbers = extractChapterNumbers(updatedChapterOnlyOutline);
      console.log(`[大纲扩展] 扩展后的章节编号: ${JSON.stringify(chapterNumbers.slice(-OUTLINE_EXPAND_CHUNK_SIZE))}`);
      
      // 更新 Zustand store 中的 currentNovel
      const currentNovel = get().currentNovel;
      if (currentNovel && currentNovel.id === novel.id) {
        await get().fetchNovelDetails(novel.id!);
      }
      toast.success("AI已构思好新的情节！");
      console.log("大纲扩展成功！");
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