/**
 * 幕间策划师模块
 * 负责在小说写作过程中，动态地为即将到来的幕布生成详细的逐章大纲。
 */
import OpenAI from 'openai';
import { useAIConfigStore } from '@/store/ai-config';
import { useGenerationSettingsStore } from '@/store/generation-settings';
import { extractDetailedAndMacro, type NarrativeStage, processOutline } from '../parsers';
import { Novel } from '@/types/novel';
import { useNovelStore } from '../../use-novel-store';

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
  const plannerPrompt = `# 分幕逐章大纲规划师 v1.0

你是一位才华横溢、深谙故事节奏的总编剧和叙事架构师，专精于将宏观剧情分解为细致入微的章节发展。你的使命是为小说的重要篇章创作详尽的逐章大纲，确保每一章都有充实的内容和合理的节奏。

## 当前篇章规划信息
- **篇章名称**: ${actToPlan.stageName}
- **章节范围**: 第 ${actToPlan.chapterRange.start} 章 到 第 ${actToPlan.chapterRange.end} 章
- **核心剧情概述**: ${actToPlan.coreSummary}
- **总章节数**: ${actToPlan.chapterRange.end - actToPlan.chapterRange.start + 1} 章

## 核心创作原则

### 1. 极致节奏控制（最高优先级）
- **微分化处理**: 将核心剧情概述中的每个要素分解成3-5个微小步骤
- **渐进式发展**: 任何重大目标都需要通过多个章节的累积才能达成
- **阻力设计**: 为主角的每个行动设置合理的障碍、挫折和延迟
- **呼吸节奏**: 紧张情节后安排缓解章节，让读者有消化的时间

### 2. 内容丰富化要求
- **人物网络**: 每章都要有新的角色互动或深化既有关系
- **世界探索**: 持续展现世界观的不同层面和细节
- **支线融入**: 将支线任务、次要情节自然编织进主线发展
- **细节积累**: 通过日常生活、环境描写丰富故事质感

### 3. 逻辑严密性标准
- **因果链条**: 每章事件都要有明确的前因后果关系
- **时间连续**: 确保时间线的自然流动和逻辑性
- **角色一致**: 角色行为符合其性格发展轨迹
- **信息递进**: 重要信息的披露要有层次和节奏

## 章节设计策略

### 1. 事件分解技法
- **单一事件拆分**: 将一个大事件分解为准备、实施、结果、反思四个阶段
- **多角度展现**: 同一事件从不同角色视角呈现
- **过程详化**: 重点描述过程而非结果
- **意外插入**: 在预期发展中插入意外事件

### 2. 节奏调控方法
- **张弛有度**: 高潮章节后安排平缓过渡章节
- **层层递进**: 情节强度逐步提升，避免突然爆发
- **伏笔布局**: 提前数章为重要事件埋下伏笔
- **回响呼应**: 让前面章节的事件在后续产生影响

### 3. 内容充实手段
- **环境互动**: 让角色与环境产生更多互动
- **心理描写**: 增加角色内心活动和思考过程
- **对话丰富**: 通过对话推进情节和深化关系
- **细节堆积**: 用生活化细节增强真实感

## 质量控制标准

### 1. 完整性要求
- **无遗漏**: 从第 ${actToPlan.chapterRange.start} 章到第 ${actToPlan.chapterRange.end} 章，每章都必须有大纲
- **无跳跃**: 章节编号必须连续，不能省略任何章节
- **无敷衍**: 每章都要有具体的事件和发展

### 2. 内容质量标准
- **字数控制**: 每章大纲50-100字，信息密度适中
- **事件明确**: 每章都要有明确的核心事件
- **推进有效**: 每章都要对整体剧情有实质推进
- **独特性**: 避免章节内容的重复和雷同

### 3. 逻辑连贯性
- **前后呼应**: 每章与前后章节有明确的逻辑关联
- **发展合理**: 情节发展符合现实逻辑和角色逻辑
- **节奏平衡**: 整体节奏分布合理，无明显断层

## 特殊技巧应用

### 1. 时间延展技巧
- **过程拉长**: 将短时间事件拉长到多章节
- **等待期**: 利用等待、准备时间增加章节
- **反复尝试**: 让角色多次尝试才能成功

### 2. 空间扩展技巧
- **地点转换**: 在不同地点发生相关事件
- **环境探索**: 详细描述和探索新环境
- **路程描写**: 将移动过程详细展现

### 3. 人物关系技巧
- **关系深化**: 用多个章节深化人物关系
- **冲突解决**: 将冲突的解决过程细化
- **情感发展**: 情感变化的渐进式展现

## 输出执行要求

### 格式标准
- **统一格式**: 严格使用"第X章：[具体剧情摘要]"格式
- **编号连续**: 章节编号从第 ${actToPlan.chapterRange.start} 章开始，连续到第 ${actToPlan.chapterRange.end} 章
- **纯大纲**: 只输出逐章大纲，不包含解释或额外文字

### 内容要求
- **具体详实**: 每章摘要都要包含具体的事件描述
- **推进明确**: 每章对整体剧情的推进作用要明确
- **节奏合理**: 整体节奏分布要符合缓慢推进的原则

## 执行检查清单
输出前请确认：
- [ ] 章节数量完整（共 ${actToPlan.chapterRange.end - actToPlan.chapterRange.start + 1} 章）
- [ ] 章节编号连续无跳跃
- [ ] 每章都有50-100字的具体内容
- [ ] 整体节奏缓慢但不拖沓
- [ ] 核心剧情概述被充分分解
- [ ] 各章节之间逻辑连贯

现在，请为这个篇章生成完整的逐章大纲，确保每一章都精彩充实，整体节奏舒缓而引人入胜。`;

  // --- 步骤 3: 调用 AI ---
  const response = await fetch('/api/ai/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activeConfigId: activeConfig.id,
      model: activeConfig.model,
      messages: [{ role: 'user', content: plannerPrompt }],
      temperature: settings.temperature,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed with status ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('API响应体为空');
  }

  // 处理流式响应
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let newPlan = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    newPlan += chunk;

    // 实时更新UI上的生成内容
    const store = useNovelStore.getState();
    store.setGeneratedContent(newPlan);
  }

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