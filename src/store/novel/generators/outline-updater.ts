import type { Novel } from "@/types/novel";
import OpenAI from "openai";
import { parseJsonFromAiResponse } from "../parsers";
import { useAIConfigStore } from "@/store/ai-config";
import { extractTextFromAIResponse } from '../utils/ai-utils';
import { useNovelStore } from '../../use-novel-store';
import { log } from "console";

/**
 * 分析师-编辑双AI协作模型的核心实现。
 * 负责在生成过程中，动态修正未来的大纲，以适应已生成的内容。
 */

interface DriftCharacter {
  name: string;
  description: string;
  personality?: string;
  background?: string;
}

interface DriftPlotClue {
  content: string;
  details?: string;
}

interface DriftRelationshipChange {
  charactersInvolved: [string, string];
  changeDescription: string;
}

// 漂移报告的详细接口
interface DriftReport {
  newCharacters: DriftCharacter[];
  newPlotClues: DriftPlotClue[];
  plotTwists: {
    description: string;
    impactOnFuture: string;
  }[];
  relationshipChanges: DriftRelationshipChange[];
}

/**
 * 分析师AI：阅读生成内容，提取关键漂移信息。
 * @param generatedChaptersContent - 已生成的章节原始内容。
 * @param openai - OpenAI实例。
 * @returns 结构化的漂移报告。
 */
const analyzeGeneratedContent = async (
  generatedChaptersContent: string,
  openai: OpenAI
): Promise<DriftReport> => {

  const driftReportPrompt = `
你是一位专业的剧情分析师。请仔细阅读以下几个章节的小说内容。你的任务是识别并以严格的JSON格式，报告在此期间发生的、可能对未来故事走向产生重大影响的**新信息**和**关键变化**。

【章节内容】
---
${generatedChaptersContent}
---

【你的任务】
请严格按照下面的JSON结构输出你的分析报告。
-   **只输出JSON对象，不要包含任何解释性文字或代码块标记**。
-   如果某个类别下没有新内容，请使用空数组 \`[]\`。
-   在描述和分析时，请使用简洁、客观的语言。

【JSON输出结构】
\`\`\`json
{
  "newCharacters": [
    {
      "name": "新角色的名字",
      "description": "对该角色的简要描述，包括外貌、身份等。",
      "personality": "（可选）角色的性格特点。",
      "background": "（可选）角色的背景故事或来源。"
    }
  ],
  "newPlotClues": [
    {
      "content": "新出现的关键情节线索的简要概括。",
      "details": "（可选）关于这个线索的更多细节或其重要性的初步分析。"
    }
  ],
  "plotTwists": [
    {
      "description": "与原计划有显著出入，或完全意料之外的关键情节转折。",
      "impactOnFuture": "分析这个转折对未来故事走向的潜在影响。"
    }
  ],
  "relationshipChanges": [
    {
      "charactersInvolved": ["角色A的名字", "角色B的名字"],
      "changeDescription": "描述这两个角色之间的关系发生了什么具体变化（例如，从盟友变为对手，产生情愫等）。"
    }
  ]
}
\`\`\`
`;

  try {
    const { configs, activeConfigId } = useAIConfigStore.getState();
    if (!activeConfigId) throw new Error("没有激活的AI配置。");
    const activeConfig = configs.find(c => c.id === activeConfigId);
    if (!activeConfig || !activeConfig.api_key) throw new Error("有效的AI配置未找到。");

    const openai = new OpenAI({
      apiKey: activeConfig.api_key,
      baseURL: activeConfig.api_base_url || undefined,
      dangerouslyAllowBrowser: true,
    });
    const apiResponse = await fetch('/api/ai/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeConfigId: activeConfig.id,
        model: activeConfig.model,
        messages: [{ role: 'user', content: driftReportPrompt }],
      })
    });
    if (!apiResponse.ok) throw new Error(`API request failed: ${await apiResponse.text()}`);
    const response = await apiResponse.json();

    const reportContent = extractTextFromAIResponse(response);
    if (!reportContent) {
      console.error("分析师AI未能生成任何内容。");
      return { newCharacters: [], newPlotClues: [], plotTwists: [], relationshipChanges: [] };
    }

    const parsedReport = parseJsonFromAiResponse(reportContent) as DriftReport;

    return parsedReport;

  } catch (error) {
    console.error("分析师AI在执行期间出错:", error);
    return { newCharacters: [], newPlotClues: [], plotTwists: [], relationshipChanges: [] };
  }
};

/**
 * 将漂移报告中的新信息更新到数据库。
 * @param driftReport - 漂移报告。
 * @param novelId - 小说ID。
 * @param currentChapter - 当前批次的起始章节号。
 */
const updateDatabaseWithDriftReport = async (
  driftReport: DriftReport,
  novelId: number,
  currentChapter: number
): Promise<void> => {

  try {
    // 1. 更新新角色
    if (driftReport.newCharacters && driftReport.newCharacters.length > 0) {
      for (const char of driftReport.newCharacters) {
        await fetch(`/api/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: char.name,
            novel_id: novelId,
            description: char.description,
            core_setting: char.description, // 使用description作为核心设定的初始值
            personality: char.personality || '待补充',
            background_story: char.background || '待补充',
            appearance: '待补充',
            background: char.background || '待补充', // 保持旧字段以防万一
            first_appeared_in_chapter: currentChapter,
            created_at: new Date(),
            updated_at: new Date(),
            is_protagonist: false,
          })
        });

      }
    }

    // 2. 更新新情节线索
    if (driftReport.newPlotClues && driftReport.newPlotClues.length > 0) {
      for (const clue of driftReport.newPlotClues) {
        await fetch(`/api/plot-clues`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: clue.content,
            novel_id: novelId,
            description: clue.details || '待补充',
            first_mentioned_in_chapter: currentChapter,
            created_at: new Date(),
            updated_at: new Date(),
            status: '未解决',
          })
        });

      }
    }
  } catch (error) {
    console.error("更新数据库时发生错误:", error);
  }
};

/**
 * 编辑AI：根据漂移报告，修正未来的大纲。
 * @param driftReport - 漂移报告。
 * @param futureOutline - 未来的章节大纲。
 * @param openai - OpenAI实例。
 * @param narrativeBlueprint - 小说的宏观叙事蓝图，作为修改的最高准则。
 * @returns 经过修正的未来大纲。
 */
const reviseFutureOutline = async (
  driftReport: DriftReport,
  futureOutline: string,
  openai: OpenAI,
  narrativeBlueprint: string
): Promise<string> => {

  // 优化：如果漂移报告为空，则无需修正，直接返回原大纲，节省AI调用成本。
  const isReportEmpty =
    (!driftReport.newCharacters || driftReport.newCharacters.length === 0) &&
    (!driftReport.newPlotClues || driftReport.newPlotClues.length === 0) &&
    (!driftReport.plotTwists || driftReport.plotTwists.length === 0) &&
    (!driftReport.relationshipChanges || driftReport.relationshipChanges.length === 0);

  if (isReportEmpty) {
    return futureOutline;
  }

  // 为防止请求体过大导致 502，可按字符数截断未来大纲
  const MAX_OUTLINE_CHARS = 15000; // 约 6-8k tokens，按需调整

  // --- 对未来大纲进行截断处理 ---
  let tail = '';
  let truncatedOutline = futureOutline;

  if (futureOutline.length > MAX_OUTLINE_CHARS) {
    tail = futureOutline.slice(MAX_OUTLINE_CHARS);
    truncatedOutline = futureOutline.slice(0, MAX_OUTLINE_CHARS) + '\n...(后续章节已省略)...';
    console.warn(`[Outline Editor] 未来大纲过长(${futureOutline.length} chars)，已截断至 ${MAX_OUTLINE_CHARS} chars`);
  }

  const editorPrompt = `
# 小说大纲动态调整编辑器 v2.0

你是一位资深的小说编辑总监，专门负责维护长篇小说的叙事逻辑一致性和情节连贯性。当实际写作内容与预定大纲产生偏差时，你需要对后续章节大纲进行精准的适应性调整。

## 核心职责
基于最新的剧情漂移情况，对未来章节规划进行最小化但必要的修订，确保故事逻辑完整性和可读性。

## 输入材料分析
**1. 宏观叙事蓝图 (不可违背的最高准则):**
这是整个故事的顶层设计，包含所有幕的规划。你的任何修改都绝对不能违背这个蓝图设定的长期走向。
---
${narrativeBlueprint}
---

**2. 剧情漂移报告 (最新变化):**
这是刚刚生成的章节中与原计划不符的新情况。你需要基于这些变化来调整未来。
\`\`\`json
${JSON.stringify(driftReport, null, 2)}
\`\`\`

**3. 原未来大纲 (待修订):**
这是原计划的后续章节。
---
${truncatedOutline}
---


## 修订原则
1. **蓝图遵从原则**: 这是最高原则。所有修改都必须服务于或至少不违背"宏观叙事蓝图"设定的长期目标。绝不能因为修正短期情节而破坏长期规划。
2. **最小干预原则**：仅在必要时修改，避免无关的大幅改动
3. **无缝融合原则**：让新元素自然融入，仿佛本就是原始设计
4. **冲突解决原则**：巧妙化解新旧内容间的逻辑矛盾
5. **主线保护原则**：维护核心情节走向和关键节点不变
6. **连贯性优先**：确保修改后的大纲内部逻辑自洽

## 修订策略
- **角色整合**：将意外出现的角色合理安排到后续情节中
- **线索调整**：重新安排线索的揭示时机和方式
- **情节重构**：调整因新发展而变得不合理的既定情节
- **节奏平衡**：保持故事张弛有度的节奏感

## 输出规范
- 直接输出修订后的完整大纲文本
- 保持原有格式和结构完全一致
- 无需任何解释说明或修改标注
- 确保修订内容与原文风格统一

## 质量标准
修订后的大纲应当：
- 逻辑严密，无内在矛盾
- 情节自然，过渡流畅
- 保持原作的核心主题和风格
- 为后续创作提供清晰指导

开始处理漂移报告和大纲调整任务。
`;

  try {
    const { configs, activeConfigId } = useAIConfigStore.getState();
    if (!activeConfigId) throw new Error("没有激活的AI配置。");
    const activeConfig = configs.find(c => c.id === activeConfigId);
    if (!activeConfig || !activeConfig.api_key) throw new Error("有效的AI配置未找到。");

    const editorApiResponse = await fetch('/api/ai/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeConfigId: activeConfig.id,
        model: activeConfig.model,
        messages: [{ role: 'user', content: editorPrompt }],
        temperature: 0.5,
        stream: true
      })
    });
    if (!editorApiResponse.ok) throw new Error(`Editor API request failed: ${await editorApiResponse.text()}`);

    if (!editorApiResponse.body) throw new Error('Editor API returned empty body');

    const reader = editorApiResponse.body.getReader();
    const decoder = new TextDecoder();
    let newContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        newContent += chunk;

        // 实时更新UI
        const store = useNovelStore.getState();
        store.setGeneratedContent(newContent);
      }
    } catch (err) {
      console.error('[Outline Editor] Stream read error:', err);
      throw new Error('读取大纲修正数据流失败');
    } finally {
      reader.releaseLock();
    }


    // 清理AI可能返回的markdown代码块标记
    newContent = newContent.replace(/```[\s\S]*?```/g, '').trim();

    // 如果之前截断过，则将尾部原样拼接回来
    if (tail) {
      newContent += '\n' + tail;
    }

    if (!newContent) {
      console.error('编辑AI未能生成任何内容，将返回原始大纲。');
      return futureOutline;
    }


    return newContent;

  } catch (error) {
    console.error("编辑AI在执行期间出错，将返回原始大纲:", error);
    return futureOutline;
  }
};


/**
 * 执行一次完整的大纲更新周期。
 * @param novel - 当前小说对象。
 * @param generatedChaptersContent - 最近生成的章节原始内容。
 * @param futureOutline - 需要修正的未来大纲。
 * @param openai - OpenAI实例。
 * @param currentChapter - 当前批次的起始章节号。
 * @returns 经过修正的、新的未来大纲。
 */
export const runOutlineUpdateCycle = async (
  novel: Novel,
  generatedChaptersContent: string,
  futureOutline: string,
  openai: OpenAI,
  currentChapter: number
): Promise<string> => {
  // 添加类型守卫
  if (typeof novel.id !== 'number') {
    throw new Error("小说ID无效，无法执行大纲更新周期。");
  }

  // 从完整大纲中提取宏观叙事蓝图
  const outlineSeparator = '\\n\\n---\\n**逐章细纲**\\n---\\n\\n';
  let narrativeBlueprint = "未找到宏观叙事蓝图，请检查大纲格式。";
  if (novel.plot_outline) {
    const separatorIndex = novel.plot_outline.indexOf(outlineSeparator);
    narrativeBlueprint = separatorIndex !== -1 ? novel.plot_outline.substring(0, separatorIndex) : "未找到宏观叙事蓝图，请检查大纲格式。";
  }


  // 1. 分析师AI提取漂移报告
  const driftReport = await analyzeGeneratedContent(generatedChaptersContent, openai);

  // 2. 将新信息更新到数据库
  await updateDatabaseWithDriftReport(driftReport, novel.id, currentChapter);

  // 3. 编辑AI修正未来大纲
  const revisedOutline = await reviseFutureOutline(driftReport, futureOutline, openai, narrativeBlueprint);

  return revisedOutline;
}; 