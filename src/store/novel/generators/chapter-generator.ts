/**
 * 章节生成相关的函数
 */

import { db } from '@/lib/db';
import { useAIConfigStore } from '@/store/ai-config';
import OpenAI from 'openai';
import { toast } from "sonner";
import { Character } from '@/types/character';
import { GenerationSettings } from '@/types/generation-settings';
import { getChapterOutline } from '../outline-utils';
import { handleOpenAIError } from '../error-handlers';
import { getGenreStyleGuide } from '../style-guides';
import { parseJsonFromAiResponse } from '../parsers';

/**
 * 生成单个新章节的上下文接口
 */
export interface ChapterGenerationContext {
  plotOutline: string;
  characters: Character[];
  settings: GenerationSettings;
}

/**
 * Zustand状态类型简化版，仅包含生成章节所需的字段
 */
interface NovelStateSlice {
  generatedContent: string | null;
  generationTask: {
    currentStep: string;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * 生成单个新章节
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 * @param novelId - 小说ID
 * @param context - 生成上下文
 * @param userPrompt - 用户提供的额外提示
 * @param chapterToGenerate - 要生成的章节编号
 */
export const generateNewChapter = async (
  get: () => any,
  set: (partial: any) => void,
  novelId: number,
  context: ChapterGenerationContext,
  userPrompt: string | undefined,
  chapterToGenerate: number,
) => {
  set({ generationLoading: true, generatedContent: "" });

  console.log("[诊断] 进入 generateNewChapter (单次完整生成模式)。");

  const { activeConfigId } = useAIConfigStore.getState();
  if (!activeConfigId) throw new Error("没有激活的AI配置");
  const activeConfig = await db.aiConfigs.get(activeConfigId);
  if (!activeConfig || !activeConfig.apiKey) throw new Error("AI配置或API密钥无效");

  const openai = new OpenAI({
    apiKey: activeConfig.apiKey,
    baseURL: activeConfig.apiBaseUrl,
    dangerouslyAllowBrowser: true,
  });

  const { plotOutline, characters, settings } = context;
  const {
    maxTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    segmentsPerChapter,
  } = settings;

  // 添加诊断日志，输出实际使用的场景数量设置
  console.log(`[诊断] 用户设置的每章场景数量: ${segmentsPerChapter}`);
  
  // 确保场景数量至少为1
  const actualSegmentsPerChapter = segmentsPerChapter && segmentsPerChapter > 0 ? segmentsPerChapter : 1;
  console.log(`[诊断] 实际使用的每章场景数量: ${actualSegmentsPerChapter}`);

  const novel = get().currentNovel;
  if (!novel) throw new Error("未找到当前小说");

  const { chapters, currentNovelIndex, currentNovelDocuments } = get();

  // --- RAG 检索增强 (用于章节解构) ---
  const nextChapterNumber = chapterToGenerate;
  const chapterOutline = getChapterOutline(plotOutline, nextChapterNumber);
  if (!chapterOutline) {
    const errorMsg = `未能为第 ${nextChapterNumber} 章找到剧情大纲，无法进行章节解构。`;
    console.warn(`[章节解构] ${errorMsg}`);
    toast.error(errorMsg);
    set({ generationLoading: false });
    return;
  }

  // --- 上下文三明治策略 (重新引入) ---
  let previousChapterContext = "";
  const latestChapter = chapters[chapters.length - 1];
  if (latestChapter && latestChapter.content) {
    const start = latestChapter.content.substring(0, 500);
    const end = latestChapter.content.substring(Math.max(0, latestChapter.content.length - 1500));
    previousChapterContext = `
为了确保情节的绝对连贯，以下是上一章的开头和结尾的关键部分，你必须在此基础上进行续写：
**上一章开头:**
\`\`\`
${start}...
\`\`\`
**上一章结尾:**
\`\`\`
...${end}
\`\`\`
`;
  }

  // [新增] 强制规则申明
  const mandatoryRules = (novel.genre.includes("日常") || novel.genre.includes("温馨") || novel.genre.includes("轻小说")) ? `
【警告：本故事为温馨日常或轻小说题材，严禁出现宏大战斗、时空危机、政治阴谋、拯救世界等重度剧情。所有情节必须严格围绕故事的核心设定和角色间的日常互动展开。】
  ` : '';

  // [新增] 最高优先级上下文（仅在第一章时注入）
  const userRequirementsContext = (novel.specialRequirements && chapterToGenerate === 1) ? `
【最高优先级上下文：用户核心要求】
你必须首先阅读并完全理解以下由用户提供的核心设定。你生成的所有内容，都必须与此设定完美保持一致，尤其是关于主角的背景和故事的开篇事件。
---
${novel.specialRequirements}
---
` : '';

  // [新增] 根据小说类型获取风格指导
  const styleGuide = getGenreStyleGuide(novel.genre, novel.style);

  console.log(`[章节解构] 正在为第 ${nextChapterNumber} 章生成场景规划。`);

  // 步骤 1: 章节解构，获取标题和场景列表
  let chapterTitle = "";
  let chapterScenes: string[] = [];

  try {
    const decompositionPrompt = `
你是一位顶级小说编剧，任务是规划即将开始的新章节，确保故事天衣无缝。

${userRequirementsContext}
${mandatoryRules}
${styleGuide}

**最高优先级指令：** 你的首要任务是延续上一章的结尾。所有你规划的场景都必须直接从这一点开始。绝对禁止出现情节断裂。

**场景数量硬性要求：** 你必须严格遵守生成 ${actualSegmentsPerChapter} 个场景的限制，不多不少。这是系统的硬性要求，违反此要求将导致生成失败。

---
**上一章结尾的关键情节:**
\`\`\`
...${latestChapter ? latestChapter.content.substring(Math.max(0, latestChapter.content.length - 1500)) : '无'}
\`\`\`
---

**本章的参考剧情大纲 (作为灵感，而非铁律):**
这是我们对本章的初步构想。请阅读并理解其核心事件。
\`\`\`
${chapterOutline || `这是第 ${nextChapterNumber} 章，但我们没有具体的剧情大纲。请根据上一章的结尾和整体故事走向，创造一个合理的情节发展。`}
\`\`\`
---

**你的具体任务:**
请综合考虑"上一章结尾"和"参考剧情大纲"，完成以下两件事：
1.  为本章起一个引人入胜的标题。
2.  设计出 **严格限制为${actualSegmentsPerChapter}个** 连贯的场景。你设计的第一个场景必须紧接着"上一章结尾"发生。如果"参考剧情大纲"与结尾情节有冲突，你必须巧妙地调整或重新安排大纲中的事件，使其能够自然地融入到故事流中，而不是生硬地插入。

**再次强调：** 你必须严格生成 ${actualSegmentsPerChapter} 个场景，不能多也不能少。这是系统的硬性限制。

请严格按照以下JSON格式返回，不要包含任何额外的解释或Markdown标记：
**JSON格式化黄金法则：如果任何字段的字符串值内部需要包含双引号(")，你必须使用反斜杠进行转义(\\")，否则会导致解析失败。**
{
  "title": "章节标题",
  "scenes": [
    "场景1的简要描述 (必须紧接上一章结尾)",
    ${actualSegmentsPerChapter > 1 ? `"场景2的简要描述",` : ''}
    ${actualSegmentsPerChapter > 2 ? `"..."` : ''}
  ]
}
      `;

    const decompResponse = await openai.chat.completions.create({
      model: activeConfig.model,
      messages: [{ role: 'user', content: decompositionPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.5,
    });

    const decompResult = parseJsonFromAiResponse(decompResponse.choices[0].message.content || "");
    chapterTitle = decompResult.title;
    const rawScenes = decompResult.scenes || [];

    // Defensive parsing for scenes, as AI might return an array of objects instead of strings.
    chapterScenes = rawScenes.map((scene: any) => {
      if (typeof scene === 'string') {
        return scene;
      }
      if (typeof scene === 'object' && scene !== null) {
        // Check for common keys AI might use for the description.
        return scene.scene || scene.description || scene.scene_description || scene.summary || null;
      }
      return null;
    }).filter(Boolean) as string[];

    if (!chapterTitle || !chapterScenes || chapterScenes.length === 0) {
      throw new Error("AI未能返回有效的章节标题或场景列表。");
    }
    
    // 记录AI返回的原始场景数量
    console.log(`[诊断] AI返回的原始场景数量: ${chapterScenes.length}`);
    
    // 如果AI返回的场景数量超过了设置值，只保留前N个场景
    if (chapterScenes.length > actualSegmentsPerChapter) {
      console.log(`[警告] AI返回的场景数量(${chapterScenes.length})超过了设置值(${actualSegmentsPerChapter})，将只使用前${actualSegmentsPerChapter}个场景`);
      chapterScenes = chapterScenes.slice(0, actualSegmentsPerChapter);
    }
    
    console.log(`[章节解构] 成功规划出 ${chapterScenes.length} 个场景。`);

  } catch (e) {
    console.error("[章节解构] 失败:", e);
    handleOpenAIError(e);
    toast.error(`章节规划失败: ${e instanceof Error ? e.message : '未知错误'}`);
    set({ generationLoading: false });
    return;
  }

  // 步骤 2: 逐场景生成内容
  let accumulatedContent = "";
  let completedScenesContent = "";

  set({ generatedContent: "" }); // 清空预览

  // 确保场景数量与设置一致
  console.log(`[诊断] 实际规划的场景数量: ${chapterScenes.length}`);
  console.log(`[诊断] 将要生成的场景: ${JSON.stringify(chapterScenes)}`);

  for (let i = 0; i < chapterScenes.length; i++) {
    const sceneDescription = chapterScenes[i];
    set({
      generationTask: {
        ...get().generationTask,
        currentStep: `生成第 ${nextChapterNumber} 章 - 场景 ${i + 1}/${chapterScenes.length}: ${sceneDescription}`,
      },
    });

    const targetTotalWords = 2000;
    // 使用实际场景数量计算每个场景的字数
    const wordsPerSceneLower = Math.round((targetTotalWords / chapterScenes.length) * 0.85);
    const wordsPerSceneUpper = Math.round((targetTotalWords / chapterScenes.length) * 1.15);

    const scenePrompt = `
你是一位顶级小说家，正在创作《${novel.name}》的第 ${nextChapterNumber} 章，标题是"${chapterTitle}"。
你的写作风格是：【${novel.style}】。

${userRequirementsContext}
${mandatoryRules}
${styleGuide}

${previousChapterContext}

${i > 0 ? `到目前为止，本章已经写下的内容如下，请你无缝地接续下去：\n---\n${completedScenesContent}\n---` : '你将要开始撰写本章的开篇。'}

当前场景的核心任务是：
**${sceneDescription}**

请你围绕这个核心任务，创作一段${wordsPerSceneLower}到${wordsPerSceneUpper}字左右的、情节丰富、文笔细腻的场景内容。
请只输出纯粹的小说正文，不要包含任何标题、场景编号或解释性文字。
      `;

    try {
      if (i > 0) {
        // 在每个新场景开始前，为UI内容和内部累积内容都加上换行符
        set((state: NovelStateSlice) => ({ generatedContent: (state.generatedContent || "") + "\n\n" }));
      }

      const stream = await openai.chat.completions.create({
        model: activeConfig.model,
        messages: [{ role: 'user', content: scenePrompt }],
        stream: true, // 开启流式传输
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
      });

      let currentSceneContent = "";
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
          set((state: NovelStateSlice) => ({ generatedContent: (state.generatedContent || "") + token }));
          currentSceneContent += token;
        }
      }
      // 当前场景流式结束后，将其完整内容更新到内部累积器中
      completedScenesContent += (i > 0 ? "\n\n" : "") + currentSceneContent;

    } catch (error) {
      console.error(`[场景生成] 场景 ${i + 1} 失败:`, error);
      handleOpenAIError(error);
      toast.error(`生成场景 ${i + 1} 时出错，章节生成中止。`);
      set({ generationLoading: false });
      return;
    }
  }

  // 步骤 3: 整合最终结果
  // 此刻 generatedContent 已经包含了完整的、流式生成的所有章节正文
  const finalBody = get().generatedContent || "";
  const finalContent = `${chapterTitle}\n|||CHAPTER_SEPARATOR|||\n${finalBody}`;
  set({ generatedContent: finalContent });
}; 