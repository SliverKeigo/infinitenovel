/**
 * 小说整体生成模块
 */
import { db } from '@/lib/db';
import { toast } from "sonner";
import OpenAI from 'openai';
import { useAIConfigStore } from '@/store/ai-config';
import { useGenerationSettingsStore } from '@/store/generation-settings';
import { getGenreStyleGuide } from '../style-guides';
import { parseJsonFromAiResponse, processOutline } from '../parsers';
import type { Character } from '@/types/character';
import { INITIAL_CHAPTER_GENERATION_COUNT } from '../constants';

/**
 * 生成整本小说的章节
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 * @param novelId - 小说ID
 * @param goal - 目标章节数
 * @param initialChapterGoal - 初始要生成的章节数，默认为5
 */
export const generateNovelChapters = async (
  get: () => any,
  set: (partial: any) => void,
  novelId: number,
  goal: number,
  initialChapterGoal = INITIAL_CHAPTER_GENERATION_COUNT
) => {
  set({
    generationTask: {
      isActive: true,
      progress: 0,
      currentStep: '正在初始化任务...',
      novelId: novelId,
      mode: 'create', // 设置为create模式，表示这是创建新小说
    },
  });

  try {
    // Step 0: Get Settings, Config and Novel Info
    const settings = await useGenerationSettingsStore.getState().getSettings();
    if (!settings) {
      throw new Error("生成设置未找到，请先在设置页面配置。");
    }
    
    // 输出诊断信息，确认设置值
    console.log(`[诊断] 小说生成任务开始，设置中的场景数量: ${settings.segmentsPerChapter}`);
    
    // 确保场景数量至少为1
    if (!settings.segmentsPerChapter || settings.segmentsPerChapter <= 0) {
      console.log(`[诊断] 场景数量无效，设置为默认值1`);
      settings.segmentsPerChapter = 1;
    }

    const { activeConfigId } = useAIConfigStore.getState();
    if (!activeConfigId) {
      throw new Error("没有激活的AI配置，请先在AI配置页面选择。");
    }
    const activeConfig = await db.aiConfigs.get(activeConfigId);
    if (!activeConfig || !activeConfig.apiKey) {
      throw new Error("有效的AI配置未找到或API密钥缺失。");
    }

    const novel = await db.novels.get(novelId);
    if (!novel) {
      throw new Error("小说信息未找到。");
    }

    // --- STAGE 1: CREATE PLOT OUTLINE ---
    set({ generationTask: { ...get().generationTask, progress: 5, currentStep: '正在创建故事大纲...' } });

    // 获取基于小说类型的风格指导
    const outlineStyleGuide = getGenreStyleGuide(novel.genre, novel.style);

    const outlinePrompt = `
      【输出格式要求】
      请直接输出大纲内容，不要包含任何前缀说明（如"好的，身为一位......"等），也不要包含额外的格式解释。
      只有大纲内容会被保存和使用。
      
      【大纲内容】
      你是一位经验丰富的小说编辑和世界构建大师。请为一部名为《${novel.name}》的小说创作一个结构化、分阶段的故事大纲。

      **核心信息:**
      - 小说类型: ${novel.genre}
      - 写作风格: ${novel.style}
      - 计划总章节数: ${goal}
      - 核心设定与特殊要求: ${novel.specialRequirements || '无'}

      ${outlineStyleGuide}

      **你的任务分为两部分：**

      **Part 1: 开篇详细剧情**
      请为故事最开始的 ${initialChapterGoal} 章提供逐章的、较为详细的剧情摘要。
      - **最高优先级指令:** 你的首要任务是仔细阅读上面的"核心设定与特殊要求"。如果其中描述了故事的开篇情节（如主角的来历、穿越过程等），那么你生成的"第1章"大纲必须严格按照这个情节来写。
      - **叙事节奏指南:** 每个章节的内容必须足够精简，只描述1-2个关键事件。禁止在单个章节中安排过多内容。学会将大事件拆分成多个章节来展开。
      - **内容要求:** 每章大纲的字数控制在50-100字左右，简明扼要地概括核心事件。
      - **格式要求:** 必须严格使用"第X章: [剧情摘要]"的格式。

      **Part 2: 后续宏观规划**
      在完成开篇的详细剧情后，请根据你对小说类型的理解，为剩余的章节设计一个更高层次的、分阶段的宏观叙事结构。
      - 你需要将故事划分为几个大的部分或"幕"
      - 在每个部分下，简要描述这一阶段的核心目标和关键转折点
      - **这部分不需要逐章展开**，而是提供一个指导未来创作方向的路线图

      **输出格式:**
      请严格按照以下格式输出，先是详细章节，然后是宏观规划。
      
      第1章: [精简的剧情摘要]
      第2章: [精简的剧情摘要]
      ...
      第${initialChapterGoal}章: [精简的剧情摘要]

      ---
      **宏观叙事规划**
      ---
      **第一幕: [幕标题] (大约章节范围)**
      - [本幕核心剧情概述]
      
      **第二幕: [幕标题] (大约章节范围)**
      - [本幕核心剧情概述]

      ...
    `;

    const openai = new OpenAI({
      apiKey: activeConfig.apiKey,
      baseURL: activeConfig.apiBaseUrl || undefined,
      dangerouslyAllowBrowser: true,
    });

    const outlineResponse = await openai.chat.completions.create({
      model: activeConfig.model,
      messages: [{ role: 'user', content: outlinePrompt }],
      temperature: settings.temperature,
    });

    // 获取并处理大纲内容
    const rawPlotOutline = outlineResponse.choices[0].message.content;
    if (!rawPlotOutline) throw new Error("未能生成大纲。");
    
    // 使用新的处理函数清理大纲内容
    const plotOutline = processOutline(rawPlotOutline);
    console.log(`[大纲生成] 原始大纲前200字符: ${rawPlotOutline.substring(0, 200)}...`);
    console.log(`[大纲生成] 处理后大纲前200字符: ${plotOutline.substring(0, 200)}...`);

    await db.novels.update(novelId, { plotOutline });
    set({ generationTask: { ...get().generationTask, progress: 20, currentStep: '大纲创建完毕！' } });

    // --- STAGE 1.5: CREATE NOVEL DESCRIPTION ---
    set({ generationTask: { ...get().generationTask, progress: 22, currentStep: '正在生成小说简介...' } });

    // 获取基于小说类型的风格指导
    const descriptionStyleGuide = getGenreStyleGuide(novel.genre, novel.style);

    const descriptionPrompt = `
      你是一位卓越的营销文案专家。请根据以下小说的核心信息，为其创作一段 150-250 字的精彩简介。
      这段简介应该引人入胜，能够吸引读者，让他们渴望立即开始阅读。请突出故事的核心冲突、独特设定和悬念。
      
      - 小说名称: 《${novel.name}》
      - 小说类型: ${novel.genre}
      - 写作风格: ${novel.style}
      - 故事大纲: ${plotOutline.substring(0, 1500)}...
      
      ${descriptionStyleGuide}
      
      请根据上述风格指南，确保简介的风格与小说类型相匹配。简介应该:
      1. 体现出该类型小说的典型魅力和特点
      2. 使用能够吸引目标读者的语言和表达方式
      3. 突出故事中最能引起读者兴趣的元素
      4. 营造与小说风格一致的氛围和基调
      
      请直接输出简介内容，不要包含任何额外的标题或解释。
    `;

    const descriptionResponse = await openai.chat.completions.create({
      model: activeConfig.model,
      messages: [{ role: 'user', content: descriptionPrompt }],
      temperature: settings.temperature,
    });

    const description = descriptionResponse.choices[0].message.content;
    if (description) {
      await db.novels.update(novelId, { description });
    }
    set({ generationTask: { ...get().generationTask, progress: 25, currentStep: '简介已生成！' } });

    // --- STAGE 2: CREATE CHARACTERS ---
    set({ generationTask: { ...get().generationTask, progress: 25, currentStep: '正在创建核心角色...' } });

    // 获取基于小说类型的风格指导
    const characterStyleGuide = getGenreStyleGuide(novel.genre, novel.style);

    const characterPrompt = `
      你是一位顶级角色设计师。基于下面的小说信息和故事大纲，设计出核心角色。
      - 小说名称: 《${novel.name}》
      - 小说类型: ${novel.genre}
      - 故事大纲: ${plotOutline.substring(0, 2000)}...

      ${characterStyleGuide}

      请根据以上信息，为这部小说创建 **1 个核心主角** 和 **2 个首批登场的配角**。这些角色应该与故事的开篇情节紧密相关。

      请注意：
      1. 角色设计应该符合上述风格指南的要求
      2. 角色性格应该有鲜明特点，避免扁平化
      3. 角色之间应该有潜在的互动可能性和关系张力
      4. 角色背景应该与故事世界观相融合

      请严格按照下面的JSON格式输出，返回一个包含 "characters" 键的JSON对象。不要包含任何额外的解释或文本。
      **JSON格式化黄金法则：如果任何字段的字符串值内部需要包含双引号(")，你必须使用反斜杠进行转义(\\")，否则会导致解析失败。**
      {
        "characters": [
          {
            "name": "主角姓名",
            "coreSetting": "一句话核心设定（根据小说主题推断，例如'一个能与古物沟通的修复师'）",
            "personality": "角色的性格特点，用几个关键词描述",
            "backgroundStory": "角色的背景故事简述，强调其与故事背景的联系"
          },
          {
            "name": "配角1姓名",
            "coreSetting": "配角1的核心设定（例如'一位带来神秘破损罗盘的古怪收藏家'）",
            "personality": "配角1的性格",
            "backgroundStory": "配角1的简要背景"
          },
          {
            "name": "配角2姓名",
            "coreSetting": "配角2的核心设定（例如'主角所在古玩街的竞争对手店主'）",
            "personality": "配角2的性格",
            "backgroundStory": "配角2的简要背景"
          }
        ]
      }
    `;

    const charactersResponse = await openai.chat.completions.create({
      model: activeConfig.model,
      messages: [{ role: 'user', content: characterPrompt }],
      response_format: { type: "json_object" },
      temperature: settings.characterCreativity,
    });

    const charactersText = charactersResponse.choices[0].message.content;
    if (!charactersText) throw new Error("未能生成人物。");

    let newCharacters: Omit<Character, 'id'>[] = [];
    try {
      const parsedCharacters = parseJsonFromAiResponse(charactersText);
      const charactersData = parsedCharacters.characters || [];

      if (Array.isArray(charactersData)) {
        newCharacters = charactersData.map((char: any) => ({
          novelId: novelId,
          name: char.name || '未知姓名',
          coreSetting: char.coreSetting || '无核心设定',
          personality: char.personality || '未知性格',
          backgroundStory: char.backgroundStory || '无背景故事',
          appearance: '',
          relationships: '',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date()
        }));
      }
    } catch (e) {
      console.error("解析AI生成的角色JSON失败:", e);
      throw new Error("AI返回了无效的角色数据格式。");
    }

    if (newCharacters.length > 0) {
      await db.characters.bulkAdd(newCharacters as Character[]);
      await db.novels.update(novelId, { characterCount: newCharacters.length });
      set({ generationTask: { ...get().generationTask, progress: 40, currentStep: '核心人物创建完毕！' } });
    } else {
      set({ generationTask: { ...get().generationTask, progress: 40, currentStep: '未生成核心人物，继续...' } });
    }

    // --- STAGE 3: GENERATE CHAPTERS ---
    const chaptersToGenerateCount = Math.min(goal, initialChapterGoal);
    const chaptersToGenerate = Array.from({ length: chaptersToGenerateCount }, (_, i) => i);

    for (const i of chaptersToGenerate) {
      // 在每次循环开始时获取最新的上下文
      const allCharacters = await db.characters.where('novelId').equals(novelId).toArray();
      const generationContext = { plotOutline, characters: allCharacters, settings };

      const chapterProgress = 40 + (i / chaptersToGenerateCount) * 60;
      set({
        generationTask: {
          ...get().generationTask,
          progress: Math.floor(chapterProgress),
          currentStep: `正在生成第 ${i + 1} / ${chaptersToGenerateCount} 章...`,
        },
      });

      console.log(`[诊断] 准备为第 ${i + 1} 章构建索引...`);
      await get().buildNovelIndex(novelId);
      console.log(`[诊断] 第 ${i + 1} 章索引构建完成。即将生成内容...`);

      await get().generateNewChapter(novelId, generationContext, undefined, i + 1);
      await get().saveGeneratedChapter(novelId);
    }

    set({
      generationTask: {
        isActive: false,
        progress: 100,
        currentStep: '全部章节生成完毕！',
        novelId: novelId,
        mode: 'create',
      },
    });
    
    // 延迟1秒后重置状态，确保用户能看到完成消息
    setTimeout(() => {
      get().resetGenerationTask();
    }, 1000);

  } catch (error) {
    console.error("Failed to generate novel chapters:", error);
    set({
      generationTask: {
        isActive: false,
        progress: get().generationTask.progress,
        currentStep: `生成失败: ${error instanceof Error ? error.message : '未知错误'}`,
        novelId: novelId,
        mode: 'create',
      },
    });
    
    // 延迟3秒后重置状态，确保用户能看到错误消息
    setTimeout(() => {
      get().resetGenerationTask();
    }, 3000);
  }
}; 