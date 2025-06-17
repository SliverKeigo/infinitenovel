/**
 * 幕间策划师模块
 * 负责在小说写作过程中，动态地为即将到来的幕布生成详细的逐章大纲。
 */
import OpenAI from 'openai';
import { useAIConfigStore } from '@/store/ai-config';
import { useGenerationSettingsStore } from '@/store/generation-settings';
import { extractDetailedAndMacro, type NarrativeStage, processOutline } from '../parsers';
import { Novel } from '@/types/novel';

/**
 * 为指定的幕布（Act）生成详细的逐章大纲，并将其与现有大纲融合。
 * @param novelId - 小说ID
 * @param actToPlan - 需要规划的幕布对象
 * @param currentPlotOutline - 当前小说完整的大纲
 * @returns 返回一个全新的、包含了新规划幕布的完整大纲字符串。
 * @throws 如果AI配置或生成设置未找到，或AI未能生成内容，则抛出错误。
 */
export const planNextAct = async (
  novelId: number,
  actToPlan: NarrativeStage,
  currentPlotOutline: string
): Promise<string> => {

  // --- 步骤 1: 获取配置和设置 ---
  const settings = await useGenerationSettingsStore.getState().getSettings();
  if (!settings) throw new Error("生成设置未找到。");

  const { configs, activeConfigId } = useAIConfigStore.getState();
  if (!activeConfigId) throw new Error("没有激活的AI配置。");
  const activeConfig = configs.find(c => c.id === activeConfigId);
  if (!activeConfig || !activeConfig.api_key) throw new Error("有效的AI配置未找到或API密钥缺失。");
  
  const novelResponse = await fetch(`/api/novels/${novelId}`);
  if (!novelResponse.ok) {
    throw new Error("获取小说信息失败。");
  }
  const novel = await novelResponse.json() as Novel;  
  if (!novel) throw new Error("小说信息未找到。");

  // --- 步骤 2: 构建提示词 ---
  const plannerPrompt = `
    你是一位才华横溢、深谙故事节奏的总编剧。你的任务是为一部名为《${novel.name}》的小说中即将到来的一个重要篇章撰写详细的、逐章的剧情大纲。

    **当前篇章的宏观规划:**
    - 篇章名称: ${actToPlan.stageName}
    - 章节范围: 第 ${actToPlan.chapterRange.start} 章 到 第 ${actToPlan.chapterRange.end} 章
    - 核心剧情概述: ${actToPlan.coreSummary}

    **你的核心原则:**
    - **放慢节奏**: 这是最高指令！你必须将上述的"核心剧情概述"分解成无数个微小的步骤、挑战、人物互动和支线任务。
    - **填充细节**: 不要让主角轻易达成目标。为他设置障碍，让他与各种人相遇，让他探索世界，让他用不止一个章节去解决一个看似简单的问题。
    - **禁止剧情飞跃**: 严禁在短短几章内完成一个重大的里程碑。

    **你的任务:**
    - 根据上述宏观规划，为这个篇章（从第 ${actToPlan.chapterRange.start} 章到第 ${actToPlan.chapterRange.end} 章）生成**全部**的**逐章节**剧情大纲。
    - 每章大纲应为50-100字的具体事件描述。

    **输出格式:**
    - 请严格使用"第X章: [剧情摘要]"的格式。
    - **只输出逐章节大纲**，不要重复宏观规划或添加任何解释性文字。
  `;

  // --- 步骤 3: 调用 AI ---
  const response = await fetch('/api/ai/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activeConfigId: activeConfig.id,
    model: activeConfig.model,
    messages: [{ role: 'user', content: plannerPrompt }],
    temperature: settings.temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed with status ${response.status}: ${errorText}`);
  }

  const plannerResponse = await response.json() as { choices: { message: { content: string } }[] };

  const newPlan = plannerResponse.choices[0].message.content;
  if (!newPlan) {
    throw new Error('AI未能生成新的幕后大纲。');
  }
  
  // --- 步骤 4: 融合大纲 ---
  const { macro, detailed: existingDetailed } = extractDetailedAndMacro(currentPlotOutline);
  
  const combinedDetailed = `${existingDetailed.trim()}\n\n${newPlan.trim()}`;
  
  const newFullOutline = `${macro.trim()}\n\n---\n**逐章细纲**\n---\n\n${combinedDetailed.trim()}`;

  // 清理并返回最终的完整大纲
  return processOutline(newFullOutline);
}; 