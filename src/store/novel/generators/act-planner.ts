/**
 * 幕间策划师模块
 * 负责在小说写作过程中，动态地为即将到来的幕布生成详细的逐章大纲。
 */
import { useGenerationSettingsStore } from '@/store/generation-settings';
import { extractDetailedAndMacro, type NarrativeStage, processOutline } from '../parsers';
import { Novel } from '@/types/novel';
import { useNovelStore } from '../../use-novel-store';
import { createAICompletion } from '@/lib/ai/completion';
import type { AIConfig } from '@/types/ai-config';
import { extractTextFromAIResponse } from '../utils/ai-utils';


/**
 * 为小说的下一幕规划详细的逐章大纲。
 * @param novel - 完整的小说对象，包含plot_outline。
 * @param activeConfig - 当前激活的AI配置。
 * @param actToPlan - 要规划的幕次信息。
 * @param previousActOutline - 上一幕的大纲，用于上下文。
 * @returns {Promise<string>} 返回包含新规划的完整大纲。
 */
export const planNextAct = async (
  novel: Novel,
  activeConfig: AIConfig,
  actToPlan: NarrativeStage,
  previousActOutline: string | null
): Promise<string> => {

  const settings = await useGenerationSettingsStore.getState().getSettings();
  if (!settings) throw new Error("生成设置未找到。");

  if (!activeConfig || !activeConfig.api_key) {
    throw new Error("有效的AI配置未提供或API密钥缺失。");
  }

  if (!novel || !novel.plot_outline) {
    throw new Error('小说或其大纲未找到。');
  }

  // 从完整大纲中提取宏观叙事蓝图
  const outlineSeparator = '\\n\\n---\\n**逐章细纲**\\n---\\n\\n';
  const separatorIndex = novel.plot_outline.indexOf(outlineSeparator);
  const narrativeBlueprint = separatorIndex !== -1
    ? novel.plot_outline.substring(0, separatorIndex)
    : "未找到宏观叙事蓝图，请检查大纲格式。";


  const previousActContext = previousActOutline
    ? `
## 上一幕剧情回顾 (用于上下文参考)
以下是刚刚结束的上一幕的剧情，请确保新的篇章能够自然地承接这些事件：
---
${previousActOutline}
---
`
    : '';

  const plannerPrompt = `# 分幕逐章大纲规划师 v3.0

你是一位才华横溢、深谙故事节奏的总编剧和叙事架构师，专精于将宏观剧情分解为细致入微的章节发展。你的使命是为小说的重要篇章创作详尽的逐章大纲，确保每一章都有充实的内容和合理的节奏。

## 宏观叙事蓝图 (不可违背的最高准则)
这是整个故事的顶层设计，包含所有幕的规划。你本次的任务是详细规划下方指定的"当前篇章"，但所有规划都绝对不能违背这个蓝图设定的长期走向，严禁预支或挪用后续篇章的核心情节。
---
${narrativeBlueprint}
---

## 当前篇章规划信息
- **篇章名称**: ${actToPlan.stageName}
- **章节范围**: 第 ${actToPlan.chapterRange.start} 章 到 第 ${actToPlan.chapterRange.end} 章
- **核心剧情概述**: ${actToPlan.coreSummary}
- **总章节数**: ${actToPlan.chapterRange.end - actToPlan.chapterRange.start + 1} 章

## 核心创作原则

### 1. 蓝图遵从原则 (最高优先级)
- **绝对服从**: 所有章节设计都必须严格服务于"宏观叙事蓝图"中为当前篇章设定的目标。
- **禁止预支**: 严禁将后续篇章的核心设定、关键转折或重要人物提前用于当前篇章。你的任务是"承上启下"，而不是"一步到位"。

### 2. 极致节奏控制
- **微分化处理**: 将核心剧情概述中的每个要素分解成3-5个微小步骤
- **渐进式发展**: 任何重大目标都需要通过多个章节的累积才能达成
- **阻力设计**: 为主角的每个行动设置合理的障碍、挫折和延迟
- **呼吸节奏**: 紧张情节后安排缓解章节，让读者有消化的时间

### 3. 内容丰富化要求
- **人物网络**: 每章都要有新的角色互动或深化既有关系
- **世界探索**: 持续展现世界观的不同层面和细节
- **支线融入**: 将支线任务、次要情节自然编织进主线发展
- **细节积累**: 通过日常生活、环境描写丰富故事质感

### 4. 逻辑严密性标准
- **因果链条**: 每章事件都要有明确的前因后果关系
- **时间连续**: 确保时间线的自然流动和逻辑性
- **角色一致**: 角色行为符合其性格发展轨迹
- **信息递进**: 重要信息的披露要有层次和节奏

## 输出执行要求

### 格式标准
- **统一格式**: 严格使用"第X章：[具体剧情摘要]"格式
- **编号连续**: 章节编号从第 ${actToPlan.chapterRange.start} 章开始，连续到第 ${actToPlan.chapterRange.end} 章
- **纯大纲**: 只输出逐章大纲，不包含解释或额外文字

### 内容要求
- **具体详实**: 每章摘要都要包含具体的事件描述
- **推进明确**: 每章对整体剧情的推进作用要明确
- **节奏合理**: 整体节奏分布要符合缓慢推进的原则

现在，请为这个篇章生成完整的逐章大纲，确保每一章都精彩充实，整体节奏舒缓而引人入胜。

${previousActContext}
`;
  
  const response = await createAICompletion(
    {
      model: activeConfig.model,
      messages: [{ role: 'user', content: plannerPrompt }],
      temperature: settings.temperature,
    },
    activeConfig,
    false // 规划大纲不需要流式
  ) as { choices: { message: { content: string | null } }[] };

  const newPlan = extractTextFromAIResponse(response);

  const { macro, detailed: existingDetailed } = extractDetailedAndMacro(novel.plot_outline);

  const combinedDetailed = `${existingDetailed.trim()}\\n\\n${newPlan.trim()}`;
  const newFullOutline = `${macro}\\n\\n---\\n**逐章细纲**\\n---\\n\\n${combinedDetailed}`;

  return processOutline(newFullOutline);
};