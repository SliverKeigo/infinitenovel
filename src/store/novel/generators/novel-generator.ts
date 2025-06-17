/**
 * 小说整体生成模块
 */
import OpenAI from 'openai';
import { useAIConfigStore } from '@/store/ai-config';
import { useGenerationSettingsStore } from '@/store/generation-settings';
import { getGenreStyleGuide } from '../style-guides';
import { generateCustomStyleGuide, getOrCreateStyleGuide } from './style-guide-generator';
import {
  parseJsonFromAiResponse,
  processOutline,
  extractDetailedAndMacro,
  extractNarrativeStages
} from '../parsers';
import type { Character, CharacterCreationData } from '@/types/character';
import { INITIAL_CHAPTER_GENERATION_COUNT } from '../constants';
import { getOrCreateCharacterRules } from './character-rules-generator';
import { generateNewChapter } from './chapter-generator';
import { toast } from 'sonner';
import { Novel } from '@/types/novel';
import type { Chapter } from '@/types/chapter';
import { extractTextFromAIResponse } from '../utils/ai-utils';
import { useNovelStore } from '../../use-novel-store';

/**
 * 更新生成内容的状态
 * @param content 当前的生成内容
 */
const updateGenerationContent = (content: string) => {
  const store = useNovelStore.getState();
  store.setGeneratedContent(content);
};

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

    // 确保场景数量至少为1
    if (!settings.segments_per_chapter || settings.segments_per_chapter <= 0) {
      settings.segments_per_chapter = 1;
    }

    const { configs, activeConfigId } = useAIConfigStore.getState();
    if (!activeConfigId) {
      throw new Error("没有激活的AI配置，请先在AI配置页面选择。");
    }
    const activeConfig = configs.find(c => c.id === activeConfigId);
    if (!activeConfig || !activeConfig.api_key) {
      throw new Error("有效的AI配置未找到或API密钥缺失。");
    }

    // 获取初始小说信息
    const novelResponse = await fetch(`/api/novels/${novelId}`);
    if (!novelResponse.ok) {
      throw new Error("获取小说信息失败");
    }
    let novel = await novelResponse.json() as Novel;
    if (!novel) {
      throw new Error("小说信息未找到。");
    }
    set({ currentNovel: novel });

    // --- STAGE 0: GENERATE CUSTOM STYLE GUIDE ---
    set({ generationTask: { ...get().generationTask, progress: 2, currentStep: '正在生成定制风格指导...' } });

    try {
      // 生成定制风格指导
      await generateCustomStyleGuide(novelId);

      // 重新获取novel对象，确保获取到最新的风格指导
      const updatedNovelResponse = await fetch(`/api/novels/${novelId}`);
      if (!updatedNovelResponse.ok) {
        throw new Error("获取小说信息失败");
      }
      const updatedNovel = await updatedNovelResponse.json() as Novel;
      if (updatedNovel) {
        novel = updatedNovel;
        set({ currentNovel: novel });
      } else {
        console.error("[风格指导] 无法重新获取小说对象");
      }
    } catch (error) {
      console.error("[风格指导] 定制风格指导生成失败，将使用默认风格指导:", error);
    }

    // --- STAGE 1: CREATE PLOT OUTLINE ---
    set({ generationTask: { ...get().generationTask, progress: 5, currentStep: '正在创建故事大纲...' } });

    // 获取风格指导，优先使用已保存的定制风格指导
    let outlineStyleGuide = "";
    try {
      // 尝试获取或创建定制风格指导
      outlineStyleGuide = await getOrCreateStyleGuide(novelId);
    } catch (error) {
      // 如果获取失败，回退到默认风格指导
      console.error("[大纲生成] 获取定制风格指导失败，使用默认风格指导:", error);
      outlineStyleGuide = getGenreStyleGuide(novel.genre, novel.style);
    }

    // [新增] 获取角色行为准则 (在此处统一定义)
    const characterRules = await getOrCreateCharacterRules(novelId);

    const openai = new OpenAI({
      apiKey: activeConfig.api_key,
      baseURL: activeConfig.api_base_url || undefined,
      dangerouslyAllowBrowser: true,
    });

    // === STAGE 1A: THE GRAND ARCHITECT ===
    set({ generationTask: { ...get().generationTask, progress: 5, currentStep: '阶段1/3: 正在构建宏观叙事蓝图...' } });

    const architectPrompt = `
      你是一位顶级的世界构建师和叙事战略家。请为一部名为《${novel.name}》的小说设计一个符合章节上限的分幕宏观叙事蓝图。

      **核心信息:**
      - 小说类型: ${novel.genre}
      - 写作风格: ${novel.style}
      - 计划总章节数: ${goal}
      - 核心设定与特殊要求: ${novel.special_requirements || '无'}
      - 风格指导: ${outlineStyleGuide}
      - 角色行为准则: ${characterRules}

      **你的任务:**
      1.  **分配章节**: 请先计算所需幕数 \(N = ⌈计划总章节数 ÷ 80⌉\)，确保 **每一幕的章节数量 ≤ 80**。
          - 如果 N < 3, 仍使用 3 幕结构；如果 N > 12, 可将后期剧情合并, 但总幕数不得超过 12 幕。
          - **节奏要求**: 虽然幕数可能增加, 但仍需 **缓慢推进**；切勿在前两幕就完成过多关键里程碑。
      2.  **定义每一幕**:
          - 为每一幕设定一个标题。
          - 清晰地写出你为该幕分配的 **章节范围**。
          - 撰写该幕的核心剧情概述，说明主角在本幕的核心任务、挑战和最终状态。
      3.  **绝对禁止**: 不要提供任何逐章的细节。

      **输出格式:**
      请严格按照以下格式输出，每一幕之间用空行隔开。**你必须包含章节范围**。
      **第一幕: [幕标题] (大约章节范围: [起始章节]-[结束章节])**
      - 核心剧情概述: [对第一幕的剧情概述]

      **第二幕: [幕标题] (大约章节范围: [起始章节]-[结束章节])**
      - 核心剧情概述: [对第二幕的剧情概述]
      ...
    `;
    const architectApiResponse = await fetch('/api/ai/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeConfigId: activeConfig.id,
        model: activeConfig.model,
        messages: [{ role: 'user', content: architectPrompt }],
        temperature: settings.temperature,
        stream: true
      })
    });

    if (!architectApiResponse.ok) {
      throw new Error('世界观构建请求失败');
    }

    if (!architectApiResponse.body) {
      throw new Error('响应体为空');
    }

    const reader = architectApiResponse.body.getReader();
    const decoder = new TextDecoder();
    let worldSetting = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        // 解码本次接收的数据
        const chunk = decoder.decode(value);
        buffer += chunk;

        // 处理SSE格式的数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                const content = data.choices[0].delta.content;
                worldSetting += content;
                // 更新生成状态
                const store = useNovelStore.getState();
                store.setGeneratedContent(worldSetting);
              }
            } catch (e) {
              console.error('解析流数据时出错:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('读取流数据时出错:', error);
      throw new Error('读取世界观数据流失败');
    } finally {
      reader.releaseLock();
    }

    if (!worldSetting) {
      throw new Error('未能成功获取世界观设定');
    }

    // 清理和处理最终的世界观设定
    worldSetting = worldSetting.trim();

    if (!worldSetting) {
      console.error("[大纲生成] 宏观叙事蓝图生成失败：响应为空");
      throw new Error("宏观叙事蓝图生成失败：AI响应为空");
    }

    // 验证大纲格式
    if (!worldSetting.includes("**第一幕:")) {
      console.error("[大纲生成] 宏观叙事蓝图格式错误，缺少第一幕标记");
      throw new Error("宏观叙事蓝图格式错误：未找到第一幕标记");
    }

    set({ generationTask: { ...get().generationTask, progress: 0.2, currentStep: `世界观已构建: ${worldSetting.substring(0, 30)}...` } });

    // === STAGE 1B: THE ACT PLANNER ===
    set({ generationTask: { ...get().generationTask, progress: 10, currentStep: '阶段2/3: 正在策划第一幕详细情节...' } });

    // 从宏观蓝图中提取第一幕的信息
    const firstActRegex = /\*\*第一幕:[\s\S]*?(?=\n\n\*\*第二幕:|\s*$)/;
    const firstActMatch = worldSetting.match(firstActRegex);
    if (!firstActMatch) throw new Error("无法从宏观蓝图中解析出第一幕。");
    const firstActInfo = firstActMatch[0];

    // 使用 extractNarrativeStages 函数来解析章节范围，代替手动正则
    const stages = extractNarrativeStages(worldSetting);

    let actOneStart = 1;
    let actOneEnd = 100; // 默认值

    if (stages.length > 0 && stages[0].chapterRange) {
      actOneStart = stages[0].chapterRange.start;
      actOneEnd = stages[0].chapterRange.end;
    } else {
      console.warn("[Act Planner] 未能从宏观大纲中解析出第一幕的章节范围，将使用默认值 1-100。");
    }

    // 生成逐章节大纲
    const plannerPrompt = `
    你是一位才华横溢、深谙故事节奏的总编剧。你的任务是为一部名为《${novel.name}》的小说的**第一幕**撰写详细的、逐章的剧情大纲。

    **第一幕的宏观规划:**
    ${firstActInfo}

    **你的核心原则:**
    - **放慢节奏**: 这是最高指令！你必须将上述的"核心剧情概述"分解成无数个微小的步骤、挑战、人物互动和支线任务。
    - **填充细节**: 不要让主角轻易达成目标。为他设置障碍，让他与各种人相遇，让他探索世界，让他用不止一个章节去解决一个看似简单的问题。
    - **禁止剧情飞跃**: 严禁在短短几章内完成一个重大的里程碑。例如，"赢得皇帝的信任"这个目标，应该通过数十个章节的事件和任务逐步累积来实现。
    - **遵守初始设定**: 如果小说的 "核心设定与特殊要求" (${novel.special_requirements || '无'}) 中包含了开篇情节，第一章必须严格遵循该设定。

    **你的任务:**
    - 根据上述宏观规划，为第一幕（从第 ${actOneStart} 章到第 ${actOneEnd} 章）生成**逐章节**剧情大纲。
    - 每章大纲应为50-100字的具体事件描述。

    **输出格式:**
    - 请严格使用"第X章: [剧情摘要]"的格式。
    - **只输出逐章节大纲**，不要重复宏观规划或添加任何解释性文字。
  `;
    const plannerApiResponse = await fetch('/api/ai/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeConfigId: activeConfig.id,
        model: activeConfig.model,
        messages: [{ role: 'user', content: plannerPrompt }],
        temperature: settings.temperature,
        stream: true
      })
    });
    if (!plannerApiResponse.ok) throw new Error(`Planner AI failed: ${await plannerApiResponse.text()}`);
    if (!plannerApiResponse.body) throw new Error('Planner API returned empty body');

    const plannerReader = plannerApiResponse.body.getReader();
    const plannerDecoder = new TextDecoder();
    let plotOutline = '';
    let plannerBuffer = '';

    try {
      while (true) {
        const { done, value } = await plannerReader.read();
        if (done) break;

        // 解码本次接收的数据
        const chunk = plannerDecoder.decode(value);
        plannerBuffer += chunk;

        // 处理SSE格式的数据 (以"data: "开头, 每行一个JSON)
        const lines = plannerBuffer.split('\n');
        plannerBuffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const deltaContent = data?.choices?.[0]?.delta?.content;
              if (deltaContent) {
                plotOutline += deltaContent;
                // 实时更新 UI
                const store = useNovelStore.getState();
                store.setGeneratedContent(plotOutline);
              }
            } catch (e) {
              console.error('[Act Planner] SSE 行解析失败:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Act Planner] 读取流数据时出错:', err);
      throw new Error('读取逐章大纲数据流失败');
    } finally {
      plannerReader.releaseLock();
    }

    plotOutline = plotOutline.replace(/```markdown/g, '').replace(/```/g, '').trim();
    if (!plotOutline) throw new Error('未能生成任何章节大纲');

    set({ generationTask: { ...get().generationTask, progress: 40, currentStep: `故事大纲已生成...` } });

    // === STAGE 1C: COMBINE & FINALIZE ===
    set({ generationTask: { ...get().generationTask, progress: 45, currentStep: '阶段3/3: 正在整合最终大纲...' } });

    // 调整顺序：宏观规划在前，逐章细纲在后，使用新的分隔符
    const finalOutline = `${worldSetting.trim()}\n\n---\n**逐章细纲**\n---\n\n${plotOutline.trim()}`;

    // 使用现有的处理函数清理最终大纲
    const processedOutline = processOutline(finalOutline);

    await fetch(`/api/novels/${novelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plot_outline: processedOutline })
    });
    set({ generationTask: { ...get().generationTask, progress: 50, currentStep: '大纲创建完毕！' } });

    // --- STAGE 1.5: CREATE NOVEL DESCRIPTION ---
    set({ generationTask: { ...get().generationTask, progress: 55, currentStep: '正在生成小说简介...' } });

    // 获取风格指导，优先使用已保存的定制风格指导
    let descriptionStyleGuide = "";
    // 如果小说已有保存的风格指导，则直接使用
    if (novel.style_guide && novel.style_guide.trim().length > 0) {
      descriptionStyleGuide = novel.style_guide;
    } else {
      // 否则使用默认风格指导
      descriptionStyleGuide = getGenreStyleGuide(novel.genre, novel.style);
    }

    if (characterRules && characterRules.trim().length > 0) {
      descriptionStyleGuide = characterRules;
    }

    const descriptionPrompt = `
      你是一位卓越的营销文案专家。请根据以下小说的核心信息，为其创作一段 150-250 字的精彩简介。
      这段简介应该引人入胜，能够吸引读者，让他们渴望立即开始阅读。请突出故事的核心冲突、独特设定和悬念。
      
      - 小说名称: 《${novel.name}》
      - 小说类型: ${novel.genre}
      - 写作风格: ${novel.style}
      - 故事大纲: ${processedOutline.substring(0, 1500)}...
      
      ${descriptionStyleGuide}
      
      请根据上述风格指南，确保简介的风格与小说类型相匹配。简介应该:
      1. 体现出该类型小说的典型魅力和特点
      2. 使用能够吸引目标读者的语言和表达方式
      3. 突出故事中最能引起读者兴趣的元素
      4. 营造与小说风格一致的氛围和基调
      
      请直接输出简介内容，不要包含任何额外的标题或解释。
    `;
    const descriptionApiResponse = await fetch('/api/ai/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeConfigId: activeConfig.id,
        model: activeConfig.model,
        messages: [{ role: 'user', content: descriptionPrompt }],
        temperature: settings.temperature,
      })
    });
    if (!descriptionApiResponse.ok) throw new Error(`Description AI failed: ${await descriptionApiResponse.text()}`);
    const descriptionResponse = await descriptionApiResponse.json();

    let description = extractTextFromAIResponse(descriptionResponse);
    description = description.trim();
    set({ generationTask: { ...get().generationTask, progress: 60, currentStep: '小说简介已完成...' } });

    if (description) {
      await fetch(`/api/novels/${novelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
      });
    }

    // --- STAGE 2: CREATE CHARACTERS ---
    set({ generationTask: { ...get().generationTask, progress: 65, currentStep: '正在创建核心角色...' } });

    // 获取风格指导，优先使用已保存的定制风格指导
    let characterStyleGuide = "";
    // 如果小说已有保存的风格指导，则直接使用
    if (novel.style_guide && novel.style_guide.trim().length > 0) {
      characterStyleGuide = novel.style_guide;
    } else {
      // 否则使用默认风格指导
      characterStyleGuide = getGenreStyleGuide(novel.genre, novel.style);
    }

    const characterPrompt = `
      你是一位顶级角色设计师。基于下面的小说信息和故事大纲，设计出核心角色。
      - 小说名称: 《${novel.name}》
      - 小说类型: ${novel.genre}
      - 故事大纲: ${processedOutline.substring(0, 2000)}...

      ${characterStyleGuide}
      ${characterRules}

      请根据以上信息，为这部小说创建 **1 个核心主角** 和 **2 个首批登场的配角**。这些角色应该与故事的开篇情节紧密相关。

      请注意：
      1. 角色设计应该符合上述风格指南的要求
      2. 角色性格应该有鲜明特点，避免扁平化
      3. 角色之间应该有潜在的互动可能性和关系张力
      4. 角色背景应该与故事世界观相融合

      【严格格式要求】
      - 你必须只输出一个JSON对象，不包含任何前言、解释或结尾评论
      - 不要使用Markdown代码块
      - 不要包含"我已经创建了"、"以下是"等任何形式的引导语
      - 不要在JSON前后添加任何额外文本
      - 直接以花括号 { 开始你的响应，以花括号 } 结束
      
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
    const charactersApiResponse = await fetch('/api/ai/completions', {
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
          { role: 'user', content: characterPrompt }
        ],
        temperature: settings.character_creativity,
      })
    });
    if (!charactersApiResponse.ok) throw new Error(`Character AI failed: ${await charactersApiResponse.text()}`);
    const charactersResponse = await charactersApiResponse.json() as { choices: { message: { content: any } }[] };

    const characterData = parseJsonFromAiResponse(extractTextFromAIResponse(charactersResponse));
    const initialCharacters = characterData.characters || [];
    set({ generationTask: { ...get().generationTask, progress: 0.8, currentStep: '主角团已创建...' } });

    let newCharacters: CharacterCreationData[] = [];
    try {
      const parsedCharacters = parseJsonFromAiResponse(extractTextFromAIResponse(charactersResponse));

      const charactersData = parsedCharacters.characters || [];

      if (Array.isArray(charactersData)) {
        newCharacters = charactersData.map((char: any, index: number) => {
          // The first character generated is assumed to be the protagonist.
          const isProtagonist = index === 0;

          return {
            name: char.name || '未知姓名',
            core_setting: char.coreSetting || '无核心设定', // Correctly map from camelCase
            personality: char.personality || '未知性格',
            background_story: char.backgroundStory || '无背景故事', // Correctly map from camelCase
            appearance: char.appearance || '',
            relationships: char.relationships || '',
            is_protagonist: isProtagonist,
            status: 'active',
            description: char.description || ''
          };
        });
      } else {
        console.error("[角色生成] 角色数据不是数组:", charactersData);
        throw new Error("角色数据格式错误：预期是数组，但收到了其他类型");
      }
    } catch (e) {
      console.error("[角色生成] 解析AI生成的角色JSON失败:", e);
      console.error("[角色生成] 问题响应内容:", charactersResponse.choices[0].message.content);

      // 尝试手动解析作为最后的补救措施
      try {

        // 简单的正则表达式提取角色信息
        const nameMatches = charactersResponse.choices[0].message.content?.match(/"name"\s*:\s*"([^"]+)"/g);
        const coreSettingMatches = charactersResponse.choices[0].message.content?.match(/"coreSetting"\s*:\s*"([^"]+)"/g);
        const personalityMatches = charactersResponse.choices[0].message.content?.match(/"personality"\s*:\s*"([^"]+)"/g);
        const backgroundStoryMatches = charactersResponse.choices[0].message.content?.match(/"backgroundStory"\s*:\s*"([^"]+)"/g);

        if (nameMatches && nameMatches.length > 0) {

          // 创建简单的角色对象
          newCharacters = nameMatches.map((_: string, index: number) => {
            const name = nameMatches[index]?.match(/"([^"]+)"$/)?.[1] || '未知';
            const coreSetting = coreSettingMatches?.[index]?.match(/"([^"]+)"$/)?.[1] || '';
            const personality = personalityMatches?.[index]?.match(/"([^"]+)"$/)?.[1] || '';
            const backgroundStory = backgroundStoryMatches?.[index]?.match(/"([^"]+)"$/)?.[1] || '';

            return {
              name: name,
              core_setting: coreSetting,
              personality: personality,
              background_story: backgroundStory,
              description: '',
              appearance: '',
              relationships: '',
              is_protagonist: false,
              status: 'active',
            };
          });

        } else {
          throw new Error("无法手动提取角色数据");
        }
      } catch (manualError) {
        console.error("[角色生成] 手动解析也失败了:", manualError);
        throw new Error(`AI返回了无效的角色数据格式，无法解析: ${e}`);
      }
    }

    if (newCharacters.length > 0) {
      await fetch('/api/characters/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characters: newCharacters, novelId }),
      });
      await fetch(`/api/novels/${novelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_count: newCharacters.length })
      });
      set({ generationTask: { ...get().generationTask, progress: 70, currentStep: '核心人物创建完毕！' } });
    } else {
      set({ generationTask: { ...get().generationTask, progress: 70, currentStep: '未生成核心人物，继续...' } });
    }

    // --- STAGE 3: GENERATE CHAPTERS ---
    const chaptersToGenerateCount = Math.min(goal, initialChapterGoal);
    const chaptersToGenerate = Array.from({ length: chaptersToGenerateCount }, (_, i) => i);

    // 获取当前最大章节号
    const chaptersResponse = await fetch(`/api/chapters?novel_id=${novelId}`);
    if (!chaptersResponse.ok) {
      throw new Error("获取现有章节信息失败");
    }
    const existingChapters = await chaptersResponse.json() as Chapter[];
    const maxChapterNumber = Math.max(...existingChapters.map((c: { chapter_number: number }) => c.chapter_number), 0);

    // 验证章节保存的辅助函数
    const verifyChapterSaved = async (novelId: number, chapterNumber: number, retries = 3) => {
      for (let i = 0; i < retries; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
        const response = await fetch(`/api/chapters?novel_id=${novelId}`);
        if (!response.ok) continue;
        const chapters = await response.json() as Chapter[];
        if (chapters.some((c: { chapter_number: number }) => c.chapter_number === chapterNumber)) {
          return true;
        }
      }
      return false;
    };

    for (const i of chaptersToGenerate) {
      // 在每次循环开始时获取最新的上下文
      const allCharactersResponse = await fetch(`/api/characters?novel_id=${novelId}`);
      if (!allCharactersResponse.ok) {
        throw new Error("获取角色信息失败");
      }
      const allCharacters = await allCharactersResponse.json();

      const generationContext = { plotOutline: processedOutline, characters: allCharacters, settings };

      const nextChapterNumber = maxChapterNumber + i + 1;
      const chapterProgress = 70 + Math.floor((i / chaptersToGenerateCount) * 30); // 从70%开始，最多到100%
      set({
        generationTask: {
          ...get().generationTask,
          progress: chapterProgress,
          currentStep: `正在生成第 ${nextChapterNumber} 章...`,
        },
      });

      await generateNewChapter(
        get,
        set,
        novel,
        generationContext,
        undefined,
        nextChapterNumber
      );
      await get().saveGeneratedChapter(novelId, nextChapterNumber);

      // 使用新的验证函数
      const saved = await verifyChapterSaved(novelId, nextChapterNumber);
      if (!saved) {
        throw new Error(`第 ${nextChapterNumber} 章保存失败：数据库中未找到该章节`);
      } 
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

    return { plotOutline };

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

    return { plotOutline: null };
  }
};
