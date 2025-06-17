import type { Novel } from "@/types/novel";
import OpenAI from "openai";
import { parseJsonFromAiResponse } from "../parsers";
import { useAIConfigStore } from "@/store/ai-config";
import { extractTextFromAIResponse } from '../utils/ai-utils';
import { useNovelStore } from '../../use-novel-store';

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
  console.log("分析师AI开始工作...");

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
    console.log("分析师AI完成工作，漂移报告已生成:", parsedReport);
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
  console.log("开始将漂移报告更新至数据库...");

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
        console.log(`新角色 "${char.name}" 已添加至数据库。`);
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
        console.log(`新线索 "${clue.content}" 已添加至数据库。`);
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
 * @returns 经过修正的未来大纲。
 */
const reviseFutureOutline = async (
  driftReport: DriftReport,
  futureOutline: string,
  openai: OpenAI
): Promise<string> => {
  console.log("编辑AI开始工作...");

  // 优化：如果漂移报告为空，则无需修正，直接返回原大纲，节省AI调用成本。
  const isReportEmpty =
    (!driftReport.newCharacters || driftReport.newCharacters.length === 0) &&
    (!driftReport.newPlotClues || driftReport.newPlotClues.length === 0) &&
    (!driftReport.plotTwists || driftReport.plotTwists.length === 0) &&
    (!driftReport.relationshipChanges || driftReport.relationshipChanges.length === 0);

  if (isReportEmpty) {
    console.log("漂移报告为空，无需修正大纲。");
    return futureOutline;
  }

  const editorPrompt = `
你是一位经验丰富的首席编辑，负责维护一部长篇小说的逻辑一致性和长期吸引力。你的任务是根据刚刚发生的最新剧情进展，对未来的章节大纲进行精细的、必要的微调。

【最新剧情变化摘要 (漂移报告)】
这是刚刚在故事中实际发生的、未经规划的新情况：
\`\`\`json
${JSON.stringify(driftReport, null, 2)}
\`\`\`

【原定的未来章节规划】
这是我们之前制定的、从下一个章节开始的全部规划：
---
${futureOutline}
---

【你的核心任务】
请仔细阅读"漂移报告"，并以其为依据，审阅并微调"未来章节规划"。你的修改必须遵循以下原则：
1.  **最小化修改原则**: 只在绝对必要时进行修改。不要进行不相关的大规模重写。
2.  **无缝整合原则**: 将报告中的新角色、新线索、新情节自然地融入到未来的规划中，使其看起来就像是"本该如此"。
3.  **解决冲突原则**: 如果新进展与未来某个规划有逻辑冲突，请巧妙地解决它。例如，如果主角意外获得了一个关键物品，那么未来他"苦苦寻找该物品"的情节就需要被修改。
4.  **主线稳定原则**: 保持故事的核心主线和重大里程碑事件不变。你的工作是调整细节，而不是改变故事的骨架。

【输出要求】
-   **请只输出经过你修订后的、完整的未来章节规划文本**。
-   不要添加任何"好的，这是修改后的大纲"之类的解释性文字。
-   保持与原始大纲完全相同的格式。
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
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data?.choices?.[0]?.delta?.content;
              if (delta) {
                newContent += delta;
                const store = useNovelStore.getState();
                store.setGeneratedContent(newContent);
              }
            } catch (e) {
              console.error('[Outline Editor] SSE parse error:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Outline Editor] Stream read error:', err);
      throw new Error('读取大纲修正数据流失败');
    } finally {
      reader.releaseLock();
    }

    // 清理AI可能返回的markdown代码块标记
    newContent = newContent.replace(/```[\s\S]*?```/g, '').trim();

    if (!newContent) {
      console.error('编辑AI未能生成任何内容，将返回原始大纲。');
      return futureOutline;
    }

    console.log('编辑AI完成工作，未来大纲已修正。');
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

  // 1. 分析师AI提取漂移报告
  const driftReport = await analyzeGeneratedContent(generatedChaptersContent, openai);

  // 2. 将新信息更新到数据库
  await updateDatabaseWithDriftReport(driftReport, novel.id, currentChapter);

  // 3. 编辑AI修正未来大纲
  const revisedOutline = await reviseFutureOutline(driftReport, futureOutline, openai);

  return revisedOutline;
}; 