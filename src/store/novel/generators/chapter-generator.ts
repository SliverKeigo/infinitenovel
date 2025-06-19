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
    return "";
  }

  // 确定当前章节所处的叙事阶段
  const currentStage = getCurrentNarrativeStage(narrativeStages, chapterNumber);
  if (!currentStage) {
    return "";
  }

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
  // 在生成新章节前，重置内容状态，防止内容串扰
  set({ generatedContent: "" });
  let completedScenesContent = "";

  const { configs, activeConfigId } = useAIConfigStore.getState();
  if (!activeConfigId) throw new Error("没有激活的AI配置。");
  const activeConfig = configs.find(c => c.id === activeConfigId);
  if (!activeConfig || !activeConfig.api_key) throw new Error("有效的AI配置未找到或API密钥缺失。");

  // 从上下文中提取大纲，并只使用章节部分
  const { plotOutline: fullOutline, settings } = context;

  // 使用健壮的函数分离宏观规划和详细章节
  const { detailed: chapterOnlyOutline, macro: macroOutline } = extractDetailedAndMacro(fullOutline);

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


  // 确保场景数量至少为1
  const actualSegmentsPerChapter = segments_per_chapter && segments_per_chapter > 0 ? segments_per_chapter : 1;

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
    contextAwareOutline += `**上一章大纲:**\n第${nextChapterNumber - 1}章: ${prevChapterOutline}\n\n`;
  }
  contextAwareOutline += `**当前章节大纲:**\n第${nextChapterNumber}章: ${chapterOutline}\n\n`;
  if (nextChapterOutline) {
    contextAwareOutline += `**下一章大纲:**\n第${nextChapterNumber + 1}章: ${nextChapterOutline}`;
  }

  // 使用RAG检索相关上下文
  const ragQuery = `${novel.name} ${chapterOutline} ${userPrompt || ""}`;
  const relevantContext = await retrieveRelevantContext(
    currentNovelIndex,
    currentNovelDocuments || [],
    ragQuery,
    5 // 检索5条最相关的内容
  );
  const ragPrompt = formatRetrievedContextForPrompt(relevantContext);

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
      styleGuide = novel.style_guide;
    } else {
      // 如果是第一章，尝试生成并保存定制风格指导
      if (chapterToGenerate === 1) {
        styleGuide = await getOrCreateStyleGuide(novel.id);
      } else {
        // 如果不是第一章且没有保存的风格指导，使用默认生成方式 
        styleGuide = getGenreStyleGuide(novel.genre, novel.style);
      }
    }
  } catch (error) {
    // 出错时回退到默认风格指导
    console.error("[风格指导] 获取定制风格指导失败，使用默认风格指导:", error);
    styleGuide = getGenreStyleGuide(novel.genre, novel.style);
  }

  // 步骤 1: 章节解构，获取标题和场景列表
  let chapterTitle = "";
  let chapterScenes: string[] = [];
  let progressStatus = "正常进度";
  let bigOutlineEvents: string[] = [];

  try {
    const decompositionPrompt = `
    # 章节场景规划专家 v1.0

你是一位顶级小说编剧和故事架构师，专精于精确执行故事大纲并创造流畅连贯的章节内容。你的核心使命是确保每一章都严格按照既定大纲发展，同时保持叙事的自然流畅。

## 核心材料与约束
${userRequirementsContext}
${styleGuide}
${characterBehaviorRules}
${ragPrompt}
${narrativeStageGuidance}

## 执行级指令系统

### 最高优先级指令：大纲忠实度
- **绝对遵循**: 本章内容必须100%实现大纲中规划的关键事件
- **零容忍原则**: 严禁跳过、改变或延后大纲中的重要情节点
- **完整实现**: 大纲中描述的每个关键要素都必须在本章中得到体现
- **质量标准**: 不仅要实现事件，还要确保实现的深度和质量

### 双重约束平衡
1. **大纲一致性**: 与既定大纲描述高度匹配
2. **叙事连贯性**: 与上一章结尾自然衔接
3. **冲突解决**: 如发现冲突，优先选择能够回归大纲轨道的方案

### 场景数量硬性限制
- **严格执行**: 必须生成且仅生成 ${actualSegmentsPerChapter} 个场景
- **均衡分配**: 每个场景都要承载有意义的剧情推进
- **完整覆盖**: 所有场景合计必须完成本章大纲的全部要求

## 当前章节背景

### 上一章结尾状态
${latestChapter ? latestChapter.content.substring(Math.max(0, latestChapter.content.length - 1500)) : '本章为小说开篇，无上一章内容'}
### 本章官方大纲 (执行标准)
**第 ${nextChapterNumber} 章大纲**:
${contextAwareOutline || `第 ${nextChapterNumber} 章缺少具体大纲。请根据整体故事走向和上一章发展，推断本章应该发生的关键事件，并严格执行。`}
### 进度管控分析
- **当前进度**: 已完成 ${nextChapterNumber - 1} 章 / 计划总计 ${novel.total_chapter_goal || "未知"} 章
- **大纲覆盖**: 详细规划的章节数 ${countDetailedChaptersInOutline(chapterOnlyOutline)} 章
- **同步要求**: 本章必须实现第 ${nextChapterNumber} 章大纲的全部内容

## 执行任务清单

### 1. 章节标题设计
- 准确反映大纲中的核心事件
- 具有吸引力和悬念感
- 与小说整体风格保持一致
- 避免剧透关键转折

### 2. 大纲事件提取
- 从大纲中精确识别2-4个关键事件点
- 确保事件的重要性和必要性
- 按逻辑顺序排列事件
- 标注每个事件的执行优先级

### 3. 进度同步评估
- **正常进度**: 当前章节与大纲章节完全对应
- **轻度偏离**: 1-2章的进度差异，可通过调整追赶
- **严重偏离**: 3章以上差异，需要加速推进或重大调整

### 4. 场景架构设计
- **场景1**: 必须自然衔接上一章结尾
- **中间场景**: 逐步推进大纲中的核心事件
- **最后场景**: 为下一章留下合适的切入点
- **整体协调**: 所有场景共同完成大纲要求

## 特殊情况处理策略

### 进度偏离处理
- **轻度偏离**: 在保持质量的前提下适度加快节奏
- **严重偏离**: 使用时间跳跃、场景切换等技巧快速追赶
- **内容压缩**: 将次要情节合并或简化
- **重点突出**: 集中精力实现最关键的大纲事件

### 冲突解决原则
- **大纲优先**: 当上一章内容与大纲冲突时，选择回归大纲
- **逻辑过渡**: 设计合理的过渡情节化解矛盾
- **角色动机**: 确保角色行为变化有充分理由
- **读者体验**: 保持叙事的可信度和流畅性

## 输出格式规范

### JSON结构标准

{
  "title": "具体、吸引人的章节标题",
  "bigOutlineEvents": [
    "从大纲中提取的关键事件1（具体描述）",
    "关键事件2（具体描述）",
    "..."
  ],
  "progressStatus": "正常进度|轻度偏离|严重偏离",
  "progressAnalysis": "对当前进度状态的简要分析说明",
  "scenes": [
    "场景1详细描述（必须说明如何衔接上一章）",
    ${actualSegmentsPerChapter > 1 ? `"场景2详细描述（推进核心事件）",` : ''}
    ${actualSegmentsPerChapter > 2 ? `"场景3详细描述（继续推进或完成事件）"` : ''}
    ${actualSegmentsPerChapter > 3 ? `, "..."` : ''}
  ]
}
输出技术要求

纯JSON: 不包含任何前言、解释或评论
格式严格: 直接以{开始，以}结束
转义处理: 字符串内双引号用"转义
完整性: 所有必需字段都必须填写

质量检查标准
在输出前确认：

 所有大纲关键事件都已纳入规划
 场景数量严格符合 ${actualSegmentsPerChapter} 个要求
 第一个场景与上一章结尾逻辑衔接
 进度评估准确反映当前状况
 JSON格式完全正确，可直接解析

现在，请为第 ${nextChapterNumber} 章生成完整的场景规划方案。


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

    const decompResponse = await apiResponse.json() as { choices: { message: { content: any } }[] };

    console.log('[DEBUG] Raw decompResponse from API:', decompResponse);

    const rawText = extractTextFromAIResponse(decompResponse);
    console.log('[DEBUG] Extracted raw text for parsing:', rawText);

    let decompResult;
    try {
      // 优先从Markdown代码块中提取纯净的JSON字符串
      const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        console.log('[DEBUG] Found JSON in markdown block. Parsing content from block.');
        decompResult = JSON.parse(match[1]);
      } else {
        // 如果没有找到代码块，作为回退，直接尝试解析整个文本
        console.log('[DEBUG] No markdown block found. Attempting to parse raw text directly.');
        decompResult = JSON.parse(rawText);
      }
    } catch (e) {
      console.error("[DEBUG] JSON.parse failed. Falling back to dirty-json parser.", e);
      // 如果标准解析失败，再使用原来的宽容解析器作为最后的尝试
      decompResult = parseJsonFromAiResponse(rawText);
    }


    console.log('[DEBUG] Parsed decompResult:', decompResult);

    if (!decompResult) {
      throw new Error("解析场景规划失败，AI返回内容为空或格式错误。");
    }

    console.log(`[DEBUG] Type of decompResult: ${typeof decompResult}`);
    console.log(`[DEBUG] decompResult.title: ${decompResult.title}`);
    console.log(`[DEBUG] Type of decompResult.scenes: ${typeof decompResult.scenes}`);
    console.log(`[DEBUG] Is decompResult.scenes an array: ${Array.isArray(decompResult.scenes)}`);
    
    chapterTitle = decompResult.title;
    progressStatus = decompResult.progressStatus || "未知";
    bigOutlineEvents = decompResult.bigOutlineEvents || [];
    const rawScenes = decompResult.scenes || [];

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

    // 如果AI返回的场景数量超过了设置值，只保留前N个场景
    if (chapterScenes.length > actualSegmentsPerChapter) {
      chapterScenes = chapterScenes.slice(0, actualSegmentsPerChapter);
    }

  } catch (e) {
    console.error("[章节解构] 失败:", e);
    handleOpenAIError(e);
    toast.error(`章节规划失败: ${e instanceof Error ? e.message : '未知错误'}`);
    set({ generationLoading: false });
    return;
  }

  // 步骤 2: 逐场景生成内容
  let accumulatedContent = "";

  set({ generatedContent: "" }); // 清空预览

  // 确保场景数量与设置一致
  console.log('[DEBUG] --- Entering Step 2: Generating scenes ---');
  console.log('[DEBUG] Total scenes to generate:', chapterScenes.length);
  console.log('[DEBUG] Scenes list:', chapterScenes);

  for (let i = 0; i < chapterScenes.length; i++) {
    const sceneDescription = chapterScenes[i];
    console.log(`[DEBUG] Starting scene ${i + 1} generation. Description: ${sceneDescription}`);
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
    # 小说内容创作大师 v1.0

你是一位才华横溢的顶级小说家，正在精心创作《${novel.name}》的第 ${nextChapterNumber} 章"${chapterTitle}"。你的写作风格是：【${novel.style}】。

## 创作环境与约束
${userRequirementsContext}
${styleGuide}
${characterBehaviorRules}
${sceneRagPrompt}
${narrativeStageGuidance}

## 核心执行指令

### 最高优先级：大纲执行
**本章必须实现的关键事件**:
${bigOutlineEvents.map((event, idx) => `${idx + 1}. ${event}`).join('\n')}

**当前进度状态**: ${progressStatus}
${progressStatus === "严重偏离" ? "**紧急调整要求**: 由于当前小说进度已严重偏离大纲轨道，你必须在本场景中加快节奏，通过精炼的叙述和高效的情节推进，确保故事尽快回归大纲预设的发展轨道。" : ""}
${progressStatus === "轻度偏离" ? "**节奏调整**: 当前进度略有偏离，请在保持质量的前提下适当加快叙事节奏，确保关键事件得到及时推进。" : ""}

## 叙事背景与衔接

### 前章衔接信息
${previousChapterContext}

### 本章已完成内容
${i > 0 ? `**前续场景内容**:\n---\n${completedScenesContent}\n---\n\n**衔接要求**: 你需要从上述内容的结尾处无缝接续，确保情节的连贯性和自然性。` : '**开篇场景**: 你将要开始撰写本章的开篇场景，需要自然衔接上一章的结尾。'}

### 当前场景核心任务
**场景使命**: ${sceneDescription}

## 创作技法指导

### 1. 叙事技巧要求
- **节奏控制**: 根据场景性质调整叙述节奏，紧张时快速推进，抒情时细致描绘
- **视角一致**: 保持与前文一致的叙述视角和人称
- **时空连贯**: 确保时间线和空间位置的逻辑连贯
- **细节丰富**: 通过具体细节增强场景的真实感和沉浸感

### 2. 角色塑造标准
- **行为逻辑**: 角色的言行必须符合其既定性格和动机
- **对话自然**: 对话要符合角色身份，推进剧情发展
- **情感层次**: 展现角色的内心变化和情感起伏
- **关系动态**: 处理好角色间的互动和关系发展

### 3. 情节推进策略
- **事件驱动**: 确保每个情节都为实现大纲事件服务
- **冲突设计**: 适当设置冲突和阻碍增加戏剧性
- **悬念营造**: 在适当位置留下悬念和伏笔
- **节点把控**: 准确把握情节转折和高潮点

### 4. 文学品质标准
- **语言精炼**: 用词准确，句式多样，避免冗余
- **意境营造**: 通过环境描写和氛围渲染增强感染力
- **主题呼应**: 场景内容要与小说整体主题保持一致
- **风格统一**: 严格遵循既定的写作风格

## 特殊创作要求

### 进度偏离时的处理策略
- **快节奏叙述**: 使用更紧凑的叙述方式
- **关键事件优先**: 集中笔墨于最重要的情节点
- **过渡精简**: 减少不必要的过渡和铺垫
- **效率最大化**: 每句话都要为推进剧情服务

### 质量控制标准
- **字数精准**: 严格控制在 ${wordsPerSceneLower}-${wordsPerSceneUpper} 字范围内
- **内容充实**: 确保字数范围内的每个字都有价值
- **逻辑严密**: 情节发展符合逻辑，无明显漏洞
- **文采飞扬**: 展现出色的文学功底和表达能力

## 输出执行规范

### 格式要求（绝对严格）
- **纯正文输出**: 只输出小说正文内容
- **无任何标记**: 不包含标题、编号、解释或引导语
- **无格式化**: 不使用Markdown或其他格式标记
- **直接开始**: 第一个字就是小说正文的开始

### 内容要求
- **完整场景**: 围绕核心任务创作完整的场景
- **自然衔接**: 与前文形成完美的连接
- **推进有力**: 有效推进大纲中的关键事件
- **文学价值**: 具备高水准的文学品质

## 创作执行检查
输出前请确认：
- [ ] 场景内容紧扣核心任务
- [ ] 有效推进了大纲中的关键事件
- [ ] 与前文实现了自然衔接
- [ ] 字数控制在指定范围内
- [ ] 保持了一贯的写作风格
- [ ] 角色行为符合设定
- [ ] 没有任何格式标记或解释文字

现在，请开始创作这个场景的精彩内容，用你的文学才华为读者呈现一个引人入胜的故事片段。
    `;

    try {
      // 更新当前场景生成状态
      set({
        generationStatus: `正在生成第 ${i + 1}/${chapterScenes.length} 个场景...`,
        generationLoading: true
      });

      toast.loading(`正在创作第 ${i + 1} 个场景，请耐心等待...`, {
        id: `scene-${i}`,
        duration: 8000
      });

      const response = await fetch('/api/ai/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activeConfigId: activeConfig.id,
          model: activeConfig.model,
          messages: [{ role: 'user', content: scenePrompt }],
          stream: true,
          temperature,
          top_p,
          frequency_penalty,
          presence_penalty,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error("API响应体为空");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sceneContent = '';

      // 如果不是第一个场景，先在UI上添加分隔符
      if (i > 0) {
        set((state: NovelStateSlice) => ({
          generatedContent: (state.generatedContent || "") + "\n\n"
        }));
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        sceneContent += chunk;

        // 实时追加内容到UI
        set((state: NovelStateSlice) => ({
          generatedContent: (state.generatedContent || "") + chunk
        }));
      }

      // 更新累积内容，为下一个场景的上下文做准备
      completedScenesContent += (i > 0 ? "\n\n" : "") + sceneContent;

      // 场景生成完成提示
      toast.success(`第 ${i + 1} 个场景创作完成！`, {
        id: `scene-${i}`,
        duration: 2000
      });

    } catch (error) {
      console.error(`[场景生成] 场景 ${i + 1} 失败:`, error);
      handleOpenAIError(error);
      toast.error(`生成场景 ${i + 1} 时出错，章节生成中止。`, {
        id: `scene-${i}`,
        duration: 3000
      });
      set({
        generationLoading: false,
        generationStatus: `场景 ${i + 1} 生成失败`
      });
      return;
    }
  }

  // 步骤 3: 整合最终结果
  const finalBody = get().generatedContent || "";
  const separator = '\n|||CHAPTER_SEPARATOR|||\n';
  const finalContent = `${chapterTitle}${separator}${finalBody}`;
  set({
    generatedContent: finalContent,
    generationLoading: false,
    generationStatus: '章节生成完成'
  });
  toast.success(`第 ${nextChapterNumber} 章已生成完毕，准备保存...`);
};  