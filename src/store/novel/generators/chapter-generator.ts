/**
 * 章节生成相关的函数
 */

import { useAIConfigStore } from '@/store/ai-config';
import OpenAI from 'openai';
import { toast } from "sonner";
import { Character } from '@/types/character';
import { GenerationSettings } from '@/types/generation-settings';
import { getChapterOutline, countDetailedChaptersInOutline } from '../utils/outline-utils';
import { handleOpenAIError } from '../error-handlers';
import { getGenreStyleGuide } from '../style-guides';
import { getOrCreateStyleGuide } from './style-guide-generator';
import { getOrCreateCharacterRules } from './character-rules-generator';
import { 
  parseJsonFromAiResponse, 
  extractDetailedAndMacro,
  extractNarrativeStages, 
  getCurrentNarrativeStage,
  type NarrativeStage
} from '../parsers';
import { CHAPTER_WORD_TARGET, CHAPTER_WORD_TOLERANCE } from '../constants';
import { retrieveRelevantContext, formatRetrievedContextForPrompt } from '../utils/rag-utils';
import { callOpenAIWithRetry } from '../utils/ai-utils';
import { Novel } from '@/types/novel';
import { extractTextFromAIResponse } from '../utils/ai-utils';

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
 * 根据宏观叙事规划生成阶段指导提示
 * @param fullOutline - 完整大纲
 * @param chapterNumber - 当前章节号
 * @returns 阶段指导提示
 */
const generateNarrativeStageGuidance = (fullOutline: string, chapterNumber: number): string => {
  // 提取宏观叙事规划
  const narrativeStages = extractNarrativeStages(fullOutline);
  if (narrativeStages.length === 0) {
    console.log("[宏观规划] 未找到宏观叙事规划，跳过阶段指导生成");
    return "";
  }

  // 确定当前章节所处的叙事阶段
  const currentStage = getCurrentNarrativeStage(narrativeStages, chapterNumber);
  if (!currentStage) {
    console.log(`[宏观规划] 无法确定第 ${chapterNumber} 章所处的叙事阶段`);
    return "";
  }

  console.log(`[宏观规划] 第 ${chapterNumber} 章处于"${currentStage.stageName}"阶段 (第${currentStage.chapterRange.start}-${currentStage.chapterRange.end}章)`);

  // 获取下一个阶段（如果有）
  const currentStageIndex = narrativeStages.findIndex(stage => 
    stage.chapterRange.start === currentStage.chapterRange.start && 
    stage.chapterRange.end === currentStage.chapterRange.end
  );
  
  const nextStage = currentStageIndex < narrativeStages.length - 1 ? narrativeStages[currentStageIndex + 1] : null;
  const previousStage = currentStageIndex > 0 ? narrativeStages[currentStageIndex - 1] : null;

  // 计算当前章节在当前阶段中的进度百分比
  const stageProgress = Math.floor(
    ((chapterNumber - currentStage.chapterRange.start) / 
    (currentStage.chapterRange.end - currentStage.chapterRange.start + 1)) * 100
  );

  // 生成阶段指导提示
  let guidance = `
【宏观叙事规划指导】
当前章节(第${chapterNumber}章)处于"${currentStage.stageName}"阶段 (第${currentStage.chapterRange.start}-${currentStage.chapterRange.end}章)
阶段进度: ${stageProgress}% (${chapterNumber - currentStage.chapterRange.start + 1}/${currentStage.chapterRange.end - currentStage.chapterRange.start + 1}章)

本阶段核心概述:
${currentStage.coreSummary}

`;

  // 添加阶段限制指导
  if (nextStage) {
    guidance += `
【重要限制】
以下内容属于后续"${nextStage.stageName}"阶段(第${nextStage.chapterRange.start}-${nextStage.chapterRange.end}章)，在当前章节中不应过早引入:
${nextStage.coreSummary}
`;
  }

  // 添加特殊进度指导
  if (stageProgress > 80) {
    guidance += `
【进度提示】
当前章节已接近本阶段末尾，应该为下一阶段的内容做铺垫，但不要直接引入下一阶段的核心元素。
`;
  } else if (stageProgress < 20) {
    guidance += `
【进度提示】
当前章节处于本阶段初期，应该专注于建立本阶段的基础元素和主题，同时与上一阶段做好过渡。
`;
  }

  return guidance;
};

/**
 * 生成单个新章节
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 * @param novel - 小说对象
 * @param context - 生成上下文
 * @param userPrompt - 用户提供的额外提示
 * @param chapterToGenerate - 要生成的章节编号
 */
export const generateNewChapter = async (
  get: () => any,
  set: (partial: any) => void,
  novel: Novel,
  context: ChapterGenerationContext,
  userPrompt: string | undefined,
  chapterToGenerate: number,
) => {
  set({ generationLoading: true, generatedContent: "" });

  console.log("[诊断] 进入 generateNewChapter (单次完整生成模式)。");

  const { configs, activeConfigId } = useAIConfigStore.getState();
  if (!activeConfigId) throw new Error("没有激活的AI配置。");
  const activeConfig = configs.find(c => c.id === activeConfigId);
  if (!activeConfig || !activeConfig.api_key) throw new Error("有效的AI配置未找到或API密钥缺失。");

  const openai = new OpenAI({
    apiKey: activeConfig.api_key,
    baseURL: activeConfig.api_base_url || undefined,
    dangerouslyAllowBrowser: true,
  });

  // 从上下文中提取大纲，并只使用章节部分
  const { plotOutline: fullOutline, characters, settings } = context;
  
  // 使用健壮的函数分离宏观规划和详细章节
  const { detailed: chapterOnlyOutline, macro: macroOutline } = extractDetailedAndMacro(fullOutline);
  console.log(`[诊断] 原始大纲长度: ${fullOutline.length}, 提取后章节部分长度: ${chapterOnlyOutline.length}, 宏观规划部分长度: ${macroOutline.length}`);
  
  // 生成宏观叙事规划指导
  const narrativeStageGuidance = generateNarrativeStageGuidance(macroOutline, chapterToGenerate);
  
  const {
    max_tokens,
    temperature,
    top_p,
    frequency_penalty,
    presence_penalty,
    segments_per_chapter,
  } = settings;

  // 添加诊断日志，输出实际使用的场景数量设置
  console.log(`[诊断] 用户设置的每章场景数量: ${segments_per_chapter}`);
  
  // 确保场景数量至少为1
  const actualSegmentsPerChapter = segments_per_chapter && segments_per_chapter > 0 ? segments_per_chapter : 1;
  console.log(`[诊断] 实际使用的每章场景数量: ${actualSegmentsPerChapter}`);

  if (!novel) throw new Error("未找到当前小说，无法生成章节。");
  if (!novel.id) throw new Error("小说ID无效，无法生成章节。");

  // [新增] 获取角色行为准则
  const characterBehaviorRules = await getOrCreateCharacterRules(novel.id);

  const stateFromGet = get();
  
  const { chapters = [], currentNovelIndex, currentNovelDocuments } = stateFromGet;

  if (chapters === undefined) {
    console.error("[!!! 调试 !!!] CRITICAL: chapters 变量在解构后仍然是 undefined！");
  }

  // --- RAG 检索增强 (用于章节解构) ---
  const nextChapterNumber = chapterToGenerate;
   
  // 只获取当前章节的大纲，而不是整个大纲
  const chapterOutline = getChapterOutline(chapterOnlyOutline, nextChapterNumber);
  if (!chapterOutline) {
    const errorMsg = `未能为第 ${nextChapterNumber} 章找到剧情大纲，无法进行章节解构。`;
    console.warn(`[章节解构] ${errorMsg}`);
    toast.error(errorMsg);
    set({ generationLoading: false });
    return;
  }
   
  // 获取前一章和后一章的大纲，用于上下文理解
  const prevChapterOutline = nextChapterNumber > 1 ? getChapterOutline(chapterOnlyOutline, nextChapterNumber - 1) : null;
  const nextChapterOutline = getChapterOutline(chapterOnlyOutline, nextChapterNumber + 1);
   
  // 构建上下文感知大纲
  let contextAwareOutline = "";
  if (prevChapterOutline) {
    contextAwareOutline += `**上一章大纲:**\n第${nextChapterNumber-1}章: ${prevChapterOutline}\n\n`;
  }
  contextAwareOutline += `**当前章节大纲:**\n第${nextChapterNumber}章: ${chapterOutline}\n\n`;
  if (nextChapterOutline) {
    contextAwareOutline += `**下一章大纲:**\n第${nextChapterNumber+1}章: ${nextChapterOutline}`;
  }
   
  console.log(`[诊断] 上下文感知大纲长度: ${contextAwareOutline.length}`);

  // 使用RAG检索相关上下文
  console.log("[RAG] 开始检索相关上下文...");
  const ragQuery = `${novel.name} ${chapterOutline} ${userPrompt || ""}`;
  const relevantContext = await retrieveRelevantContext(
    currentNovelIndex,
    currentNovelDocuments || [],
    ragQuery,
    5 // 检索5条最相关的内容
  );
  const ragPrompt = formatRetrievedContextForPrompt(relevantContext);
  console.log("[RAG] 检索完成，获取到相关上下文");

  // --- 上下文三明治策略 (重新引入) ---
  let previousChapterContext = "";
  let latestChapter = null;
  if (Array.isArray(chapters) && chapters.length > 0) {
    latestChapter = chapters[chapters.length - 1];
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
  } else {
    console.log('[诊断] 未在状态中找到章节列表或列表为空，跳过"上下文三明治"策略。');
  }

  // [新增] 最高优先级上下文（仅在第一章时注入）
  let userRequirementsContext = "";
  if (userPrompt) {
    userRequirementsContext = `【用户额外要求】\n${userPrompt}\n`;
  } else if (novel.special_requirements) {
    // 如果没有临时的用户要求，则使用小说自身的特殊要求
    userRequirementsContext = `【小说核心设定】\n${novel.special_requirements}\n`;
  }

  // [修改] 获取风格指导，优先使用保存的定制风格指导
  let styleGuide = "";
  try {
    // 如果小说已有保存的风格指导，则直接使用
    if (novel.style_guide && novel.style_guide.trim().length > 0) {
      console.log("[风格指导] 使用已保存的定制风格指导");
      styleGuide = novel.style_guide;
    } else {
      // 如果是第一章，尝试生成并保存定制风格指导
      if (chapterToGenerate === 1) {
        console.log("[风格指导] 正在生成定制风格指导");
        styleGuide = await getOrCreateStyleGuide(novel.id);
      } else {
        // 如果不是第一章且没有保存的风格指导，使用默认生成方式
        console.log("[风格指导] 使用默认风格指导生成方式");
        styleGuide = getGenreStyleGuide(novel.genre, novel.style);
      }
    }
  } catch (error) {
    // 出错时回退到默认风格指导
    console.error("[风格指导] 获取定制风格指导失败，使用默认风格指导:", error);
    styleGuide = getGenreStyleGuide(novel.genre, novel.style);
  }

  console.log(`[章节解构] 正在为第 ${nextChapterNumber} 章生成场景规划。`);

  // 步骤 1: 章节解构，获取标题和场景列表
  let chapterTitle = "";
  let chapterScenes: string[] = [];
  let progressStatus = "正常进度";
  let bigOutlineEvents: string[] = [];

  try {
    const decompositionPrompt = `
你是一位顶级小说编剧，任务是规划即将开始的新章节，确保故事严格按照大纲发展。

${userRequirementsContext}
${styleGuide}
${characterBehaviorRules}
${ragPrompt}
${narrativeStageGuidance}

**最高优先级指令：** 你的首要任务是确保本章内容忠实地实现大纲中规划的事件。章节内容必须严格遵循大纲描述的关键事件，不得随意跳过或改变大纲中的重要情节点。

**双重约束：** 你需要同时满足两个核心要求：
1. 确保本章内容与大纲中对应章节的描述高度一致
2. 确保叙事与上一章的结尾自然衔接

如果上一章结尾与大纲存在冲突，你必须想办法在本章中回归到大纲的轨道上，而不是继续偏离。

**场景数量硬性要求：** 你必须严格遵守生成 ${actualSegmentsPerChapter} 个场景的限制，不多不少。

---
**上一章结尾的关键情节:**
\`\`\`
...${latestChapter ? latestChapter.content.substring(Math.max(0, latestChapter.content.length - 1500)) : '无'}
\`\`\`
---

**本章的剧情大纲 (必须严格遵循):**
这是我们为第 ${nextChapterNumber} 章设计的官方大纲。你必须确保所有这些关键事件都在本章中得到实现。
\`\`\`
${contextAwareOutline || `这是第 ${nextChapterNumber} 章，但我们没有具体的剧情大纲。请根据上一章的结尾和整体故事走向，创造一个合理的情节发展。`}
\`\`\`
---

**大纲进度追踪:**
当前小说总体进度: 已完成 ${nextChapterNumber - 1} 章 / 计划总章节 ${novel.total_chapter_goal || "未知"} 章
大纲中详细规划的章节数: ${countDetailedChaptersInOutline(chapterOnlyOutline)} 章
根据预期进度，本章应实现的大纲内容: 第 ${nextChapterNumber} 章的全部内容
---

**你的具体任务:**
1. 为本章起一个引人入胜的标题，能够反映大纲中描述的主要事件。
2. 分析本章的大纲，提取出2-4个需要在本章实现的关键事件点。
3. 评估当前小说进度是否与大纲匹配（正常进度、轻度偏离、严重偏离）。
4. 设计出 **严格限制为${actualSegmentsPerChapter}个** 连贯的场景，这些场景必须涵盖大纲中规划的所有关键事件。
5. 如果发现当前小说进度已经偏离大纲(例如，大纲中第3章提到主角进入村庄，但实际到第7章还未发生)，请在设计场景时特别注意加速推进剧情，确保尽快回归大纲轨道。

**场景设计指导:**
- 第一个场景必须自然衔接上一章结尾
- 所有场景必须共同推进大纲中规划的核心情节
- 如果发现进度偏离，使用加速叙事技巧（如时间跳跃、场景切换等）追赶大纲进度

【严格格式要求】
- 你必须只输出一个JSON对象，不包含任何前言、解释或结尾评论
- 不要使用Markdown代码块
- 不要包含"我已经分析了"、"以下是"等任何形式的引导语
- 不要在JSON前后添加任何额外文本
- 直接以花括号 { 开始你的响应，以花括号 } 结束

**JSON格式化黄金法则：如果任何字段的字符串值内部需要包含双引号(")，你必须使用反斜杠进行转义(\\")，否则会导致解析失败。**

{
  "title": "章节标题",
  "bigOutlineEvents": ["本章需要实现的大纲中的关键事件1", "关键事件2", ...],
  "progressStatus": "正常进度|轻度偏离|严重偏离", 
  "scenes": [
    "场景1的简要描述 (必须衔接上一章结尾)",
    ${actualSegmentsPerChapter > 1 ? `"场景2的简要描述",` : ''}
    ${actualSegmentsPerChapter > 2 ? `"..."` : ''}
  ]
}
      `;

    const apiResponse = await fetch('/api/ai/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeConfigId: activeConfig.id,
        model: activeConfig.model,
        messages: [
          {
            role: 'system',
            content: '你是一个只输出JSON的助手。不要包含任何解释、前缀或后缀。不要使用Markdown代码块。直接以花括号{开始你的响应，以花括号}结束。不要添加任何额外的文本。'
          },
          { role: 'user', content: decompositionPrompt }
        ],
        temperature: 0.5,
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`API request failed with status ${apiResponse.status}: ${errorText}`);
    }

    const decompResponse = await apiResponse.json() as { choices: { message: { content: string } }[] };

    const decompResult = parseJsonFromAiResponse(extractTextFromAIResponse(decompResponse));
    chapterTitle = decompResult.title;
    progressStatus = decompResult.progressStatus || "未知";
    bigOutlineEvents = decompResult.bigOutlineEvents || [];
    const rawScenes = decompResult.scenes || [];

    // 记录进度状态
    console.log(`[章节解构] 进度状态: ${progressStatus}`);
    console.log(`[章节解构] 本章大纲关键事件: ${JSON.stringify(bigOutlineEvents)}`);

    // 如果进度严重偏离，提示用户
    if (progressStatus === "严重偏离") {
      toast.warning("AI检测到小说进度与大纲严重偏离，正在尝试调整情节以回归大纲轨道。");
    }

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

    // 使用常量替代硬编码值
    const targetTotalWords = CHAPTER_WORD_TARGET;
    // 使用实际场景数量计算每个场景的字数
    const wordsPerSceneLower = Math.round((targetTotalWords / chapterScenes.length) * (1 - CHAPTER_WORD_TOLERANCE));
    const wordsPerSceneUpper = Math.round((targetTotalWords / chapterScenes.length) * (1 + CHAPTER_WORD_TOLERANCE));

    // 为每个场景生成时添加RAG上下文
    // 使用场景描述作为查询，获取更具体的相关内容
    const sceneRagQuery = `${novel.name} ${chapterTitle} ${sceneDescription}`;
    const sceneRelevantContext = await retrieveRelevantContext(
      currentNovelIndex,
      currentNovelDocuments || [],
      sceneRagQuery,
      3 // 每个场景检索3条最相关的内容
    );
    const sceneRagPrompt = formatRetrievedContextForPrompt(sceneRelevantContext);

    const scenePrompt = `
你是一位顶级小说家，正在创作《${novel.name}》的第 ${nextChapterNumber} 章，标题是"${chapterTitle}"。
你的写作风格是：【${novel.style}】。

${userRequirementsContext}
${styleGuide}
${characterBehaviorRules}
${sceneRagPrompt}
${narrativeStageGuidance}

**大纲指导（最高优先级）:**
根据小说大纲，本章必须实现以下关键事件：
${bigOutlineEvents.map((event, idx) => `${idx+1}. ${event}`).join('\n')}

**进度状态:** ${progressStatus}
${progressStatus === "严重偏离" ? "由于当前小说进度已严重偏离大纲轨道，你必须在本章中想办法尽快推进剧情，确保回归大纲预设的情节发展。" : ""}

${previousChapterContext}

${i > 0 ? `到目前为止，本章已经写下的内容如下，请你无缝地接续下去：\n---\n${completedScenesContent}\n---` : '你将要开始撰写本章的开篇。'}

当前场景的核心任务是：
**${sceneDescription}**

请你围绕这个核心任务，创作一段${wordsPerSceneLower}到${wordsPerSceneUpper}字左右的、情节丰富、文笔细腻的场景内容。

【严格格式要求】
- 只输出纯粹的小说正文
- 不要包含任何标题、场景编号或解释性文字
- 不要包含"我已经写好了"、"以下是"等任何形式的引导语
- 不要在正文前后添加任何额外文本
- 不要使用Markdown格式
- 直接开始你的小说正文，不要有任何前缀
      `;

    try {
      if (i > 0) {
        // 在每个新场景开始前，为UI内容和内部累积内容都加上换行符
        set((state: NovelStateSlice) => ({ generatedContent: (state.generatedContent || "") + "\n\n" }));
      }

      const response = await fetch('/api/ai/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeConfigId: activeConfig.id,
          model: activeConfig.model,
          messages: [{ role: 'user', content: scenePrompt }],
          stream: true,
          max_tokens: max_tokens,
          temperature,
          top_p,
          frequency_penalty,
          presence_penalty,
        })
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentSceneContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last, possibly incomplete line

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data.trim() === '[DONE]') {
              // End of stream signal
              break;
            }
            try {
              const chunk = JSON.parse(data);
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
          set((state: NovelStateSlice) => ({ generatedContent: (state.generatedContent || "") + token }));
          currentSceneContent += token;
        }
            } catch (e) {
              // console.error("Failed to parse stream chunk", data, e);
            }
          }
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
  const finalBody = get().generatedContent || "";
  const separator = '\n|||CHAPTER_SEPARATOR|||\n';
  const finalContent = `${chapterTitle}${separator}${finalBody}`;
  set({ generatedContent: finalContent });
  toast.success(`第 ${nextChapterNumber} 章已生成完毕，准备保存...`);
};