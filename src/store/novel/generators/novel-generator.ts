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
import { log } from 'console';

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

    const descriptionPrompt = `
    # 小说营销简介创作专家 v1.0

你是一位顶级的营销文案专家和畅销书推广大师，专精于创作能够瞬间抓住读者眼球的小说简介。你的任务是为一部小说创作一段精彩绝伦的营销简介。

## 核心材料
- **小说名称**: 《${novel.name}》
- **小说类型**: ${novel.genre}
- **写作风格**: ${novel.style}
- **风格指南**: ${outlineStyleGuide}

## 创作策略框架

### 1. 情感钩子设计
- **开场冲击**: 用最引人注目的元素作为开头
- **悬念营造**: 提出让读者必须知道答案的问题
- **情感共鸣**: 触及目标读者的内心需求和幻想
- **紧迫感**: 营造"现在就要读"的迫切感

### 2. 结构化叙述策略
- **黄金开头** (30-40字): 最震撼的设定或冲突
- **核心冲突** (60-80字): 主角面临的核心挑战和选择
- **独特卖点** (40-60字): 区别于同类作品的特色元素
- **悬念结尾** (20-30字): 让读者欲罢不能的问题或暗示

### 3. 类型化表达要求
根据小说类型采用相应的营销语言：
- **玄幻/奇幻**: 强调世界观宏大、力量体系、逆天改命
- **都市/现实**: 突出情感共鸣、人生感悟、现实冲突
- **悬疑/推理**: 营造紧张氛围、智力挑战、真相揭秘
- **科幻**: 展现未来设定、科技元素、思想冲击
- **历史**: 突出时代背景、人物传奇、历史厚重感

### 4. 读者心理把握
- **目标受众分析**: 精准定位该类型小说的核心读者群
- **痛点挖掘**: 找到读者最渴望在小说中获得的体验
- **期待管理**: 承诺读者能在书中找到的价值和乐趣
- **差异化定位**: 突出与同类作品的显著区别

## 文案技巧要求

### 1. 语言表达标准
- **节奏感**: 长短句结合，营造阅读韵律
- **画面感**: 用具象描述替代抽象概念
- **情绪递进**: 从好奇到震撼到渴望的情感升级
- **关键词优化**: 使用该类型读者喜爱的核心词汇

### 2. 避免的营销误区
- 避免过度剧透关键情节
- 避免使用过于夸大的形容词
- 避免与小说实际内容不符的承诺
- 避免过于复杂的背景介绍

### 3. 质量控制标准
- **字数控制**: 严格控制在150-250字之间
- **信息密度**: 每句话都要承载有效信息
- **流畅度**: 确保阅读体验顺畅自然
- **记忆点**: 至少包含2-3个让人印象深刻的元素

## 创作执行指令

### 第一步：分析提取
从故事大纲中提取：
- 最具冲击力的设定元素
- 主角的核心困境和目标
- 最大的悬念和转折点
- 独特的世界观或概念

### 第二步：受众定位
确定目标读者的：
- 年龄层和性别倾向
- 阅读偏好和期待
- 情感需求和幻想类型
- 最容易被触动的元素

### 第三步：文案构建
按照结构化策略组织内容：
1. 震撼开场（吸引注意）
2. 核心冲突（建立代入）
3. 独特卖点（创造差异）
4. 悬念结尾（激发行动）

## 输出要求
- 直接输出简介内容，无需任何标题或解释
- 确保风格与小说类型和目标受众完美匹配
- 每句话都要精雕细琢，具有营销价值
- 整体呈现应该让读者产生强烈的阅读冲动

现在，请创作一段能够让读者瞬间被吸引、迫不及待想要阅读的精彩简介。
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


    // === STAGE 1A: THE GRAND ARCHITECT ===
    set({ generationTask: { ...get().generationTask, progress: 5, currentStep: '阶段1/3: 正在构建宏观叙事蓝图...' } });

    const architectPrompt = `# 小说宏观叙事蓝图设计师 v2.0

你是一位顶级的世界构建师和叙事战略家，专精于创造节奏舒缓、内容丰富的长篇小说结构。请为一部名为《${novel.name}》的小说设计一个符合章节上限的分幕宏观叙事蓝图。

## 核心信息
- 小说类型: ${novel.genre}
- 写作风格: ${novel.style}
- 核心简介: ${description || '无'}
- 计划总章节数: ${goal}
- 核心设定与特殊要求: ${novel.special_requirements || '无'}
- 风格指导: ${outlineStyleGuide}
- 角色行为准则: ${characterRules}

## 绝对约束条件 (违反即为失败)

### 1. 结构硬性限制
- **强制幕数上限**: 总幕数**绝对不能**超过12幕
- **最小幕数**: 总幕数不得少于3幕
- **章节覆盖**: 必须覆盖从第1章到第${goal}章的所有章节，不得遗漏

### 2. 设定一致性约束
- **类型契合度**: 所有情节元素必须与声明的小说类型高度契合，不得引入与该类型世界观冲突的元素
- **世界观统一**: 必须严格遵循已确立的世界观设定，保持内在逻辑的一致性
- **系统功能边界**: 严格按照"特殊要求"中明确描述的系统功能，不得擅自扩展或添加未提及的功能
- **系统存在形式**: 系统仅存在于主角脑海中，不会显现为实体，不会主动干预外界
- **角色行为逻辑**: 所有角色的行为和决策必须符合已建立的角色设定和行为准则

### 3. 内容质量要求
- **设定忠实性**: 不得偏离或矛盾于已提供的核心设定信息
- **逻辑自洽性**: 所有情节发展必须符合该类型小说的基本逻辑框架
- **功能限制性**: 任何超自然或系统能力必须严格限制在已明确描述的范围内

## 设计要求

### 1. 节奏控制原则
- **极度缓慢推进**: 前三幕应仅完成世界观建立、角色介绍和初步冲突设定
- **渐进式发展**: 重大转折点应均匀分布在各幕中，避免前期过于密集
- **留白艺术**: 每幕应有足够的"呼吸空间"供角色发展和世界探索

### 2. 支线设计要求
- **多线并行**: 每幕至少设计2-3条支线，与主线形成呼应
- **支线类型**: 角色发展、世界观探索、情感关系、悬念伏笔等
- **支线融合**: 支线应与主线有机结合，不可游离于主体叙事之外

## 执行流程

### 第一步：设定分析
1. 深度解析小说类型的核心特征和约定俗成的元素
2. 明确特殊要求中的所有限制和边界
3. 识别潜在的设定冲突点并规避

### 第二步：结构规划
1. 根据总章节数和12幕上限，确定最终幕数
2. 为每幕分配章节范围，确保无缝覆盖
3. 验证节奏分布的合理性

### 第三步：内容设计
为每一幕提供：
- 幕标题（体现该幕的核心主题）
- 章节范围（必须明确标注）
- 主线剧情概述（严格符合设定）
- 支线设计概述（至少2-3条支线）
- 节奏特点（该幕的叙事特点）

## 输出格式
请严格按照以下格式输出：

**第一幕：[幕标题]（第[X]-[Y]章）**
- 主线：[主线剧情概述]
- 支线：[支线1] [支线2] [支线3]
- 节奏：[节奏特点描述]

**第二幕：[幕标题]（第[X]-[Y]章）**
- 主线：[主线剧情概述]
- 支线：[支线1] [支线2] [支线3]
- 节奏：[节奏特点描述]

[继续后续各幕...]

## 最终检查要求
输出前必须验证：
1. 总幕数是否在3-12幕范围内
2. 是否完全遵循小说类型的基本框架
3. 是否严格遵守系统功能限制
4. 是否保持了设定的内在一致性
5. 章节范围是否完整覆盖

请立即开始设计。你的回答必须直接以"**第一幕："开头，不包含任何其他文字。
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
      const errorText = await architectApiResponse.text();
      throw new Error(`Architect AI failed: ${errorText}`);
    }

    if (!architectApiResponse.body) {
      throw new Error("响应体为空");
    }

    // 处理流式响应
    let architectContent = '';
    const streamReader = architectApiResponse.body.getReader();
    const streamDecoder = new TextDecoder();

    while (true) {
      const { done, value } = await streamReader.read();
      if (done) break;

      const chunk = streamDecoder.decode(value, { stream: true });
      architectContent += chunk;

      // 实时更新UI上的生成内容
      updateGenerationContent(architectContent);
    }

    architectContent = architectContent.replace(/```markdown/g, "").replace(/```/g, "").trim();

    if (!architectContent) {
      throw new Error("未能生成任何宏观叙事蓝图");
    }

    console.log('architectContent', architectContent.slice(0, 200));

    // 更新任务状态
    set({ generationTask: { ...get().generationTask, progress: 10, currentStep: '阶段1/3: 宏观叙事蓝图已完成，正在解析...' } });

    // 解析宏观叙事蓝图
    const architectInfo = extractArchitectInfo(architectContent);
    console.log('architectInfo', architectInfo);

    // 更新任务状态
    set({ generationTask: { ...get().generationTask, progress: 15, currentStep: '阶段1/3: 正在分析宏观叙事结构...' } });

    // 更新生成状态
    set({
      generationTask: {
        ...get().generationTask,
        progress: 20,
        currentStep: '阶段1/3: 正在生成第一幕大纲...'
      },
      firstActInfo: architectInfo.firstActInfo,
      actOneStart: architectInfo.actOneStart,
      actOneEnd: architectInfo.actOneEnd,
    });

    // 更新生成状态
    const store = useNovelStore.getState();
    store.setGeneratedContent(architectContent);

    // 验证大纲格式
    if (!architectContent.includes("第一幕")) {
      console.error("[大纲生成] 宏观叙事蓝图格式错误，缺少第一幕标记");
      throw new Error("宏观叙事蓝图格式错误：未找到第一幕标记");
    }

    set({ generationTask: { ...get().generationTask, progress: 0.2, currentStep: `世界观已构建: ${architectContent.substring(0, 30)}...` } });

    // === STAGE 1B: THE ACT PLANNER (BATCHED) ===
    set({ generationTask: { ...get().generationTask, progress: 10, currentStep: '阶段2/3: 正在策划第一幕详细情节...' } });

    // 从宏观蓝图中提取第一幕的信息
    const firstActRegex = /\*\*第一幕[：:][\s\S]*?(?=\n\n\*\*第二幕[：:]|\s*$)/;
    const firstActMatch = architectContent.match(firstActRegex);
    if (!firstActMatch) throw new Error("无法从宏观蓝图中解析出第一幕。");
    const firstActInfo = firstActMatch[0];

    let actOneStart = 1;
    let actOneEnd = 70; // Default, consistent with architect prompt
    if (architectInfo.actOneStart && architectInfo.actOneEnd) {
      actOneStart = architectInfo.actOneStart;
      actOneEnd = architectInfo.actOneEnd;
    }

    let plotOutline = "";
    const BATCH_SIZE = 20; // Generate 10 chapters at a time

    for (let currentStart = actOneStart; currentStart <= actOneEnd; currentStart += BATCH_SIZE) {
      const currentEnd = Math.min(currentStart + BATCH_SIZE - 1, actOneEnd);
      const totalChaptersInAct = actOneEnd - actOneStart + 1;
      const chaptersDone = currentStart - actOneStart;
      const batchProgress = Math.round((chaptersDone / totalChaptersInAct) * 30); // 10% to 40% of total progress is for this stage

      set({
        generationTask: {
          ...get().generationTask,
          progress: 10 + batchProgress,
          currentStep: `阶段2/3: 正在策划情节 ${currentStart}-${currentEnd}章...`,
        }
      });

      // Context from previous chapters, take last 2.
      const previousChaptersContext = plotOutline
        .split('**第')
        .slice(-3) // Take last 2 chapters + empty string from split
        .join('**第')
        .trim();

      const outlinePrompt = `# 逐章节大纲生成专家 v4.0 (连续生成模式)

你是一位才华横溢、深谙故事节奏的总编剧。你的任务是为小说《${novel.name}》**继续**生成从第${currentStart}章到第${currentEnd}章的详细大纲。

## 核心材料
**第一幕的宏观规划:**
${firstActInfo}

**小说基础信息:**
- 小说类型: ${novel.genre}
- 写作风格: ${novel.style}
- 核心设定与特殊要求: ${novel.special_requirements || '无'}

${previousChaptersContext ? `## 已有大纲 (用于衔接)
**请务必紧密衔接以下最新章节内容，确保故事的连贯性：**
${previousChaptersContext}` : ''}

## 绝对约束条件 (违反即废弃)

### 1. 设定一致性铁律
- **世界观严格限制**: 必须100%符合小说类型的世界观框架，不得引入任何冲突元素
- **特殊设定边界**: 严格遵循"特殊要求"中描述的任何特殊设定或能力，绝不擅自添加、扩展或修改
- **背景设定锁定**: 所有场景、物品、概念必须与已确立的世界背景完全吻合
- **角色行为逻辑**: 角色的所有行为必须符合其设定和当前认知水平

### 2. 内容质量检查
- **逻辑自洽**: 每个情节必须有合理的前因后果
- **细节真实**: 所有描述的事物必须符合该世界的基本规律
- **情节合理**: 不得出现突兀的转折或违背常理的发展

## 创作核心原则
- **极度缓慢推进**: 将每个重大事件拆分成多个微小步骤
- **渐进式发展**: 任何重要目标都需要通过多章节的累积才能达成
- **细节填充**: 用大量日常互动、环境描写、心理活动填充剧情
- **连贯衔接**: 每章必须自然承接上一章，形成流畅的故事流

## 强制检查流程
**生成每章前必须验证:**
1. 该章节内容是否完全符合小说类型设定？
2. 是否严格遵循了所有特殊要求中的设定？
3. 是否引入了与世界观冲突的元素？
4. 角色行为是否符合其设定和认知？
5. 情节发展是否逻辑合理？

## 输出格式要求
**请严格按照以下格式，仅输出从第${currentStart}章到第${currentEnd}章的内容。**
- 每章之间用一个空行分隔
- 禁止任何形式的中断、说明、总结或进度提示

**第N章：具体章节标题**  
[200-300字的具体叙事内容，包含完整的场景、对话和行动描述，严格符合世界观设定]

[空行]

## 绝对禁止
- **设定违背**: 任何与小说类型或世界观冲突的元素
- **设定扩展**: 添加特殊要求中未提及的能力或设定
- **重复生成**: 不要生成${currentStart}章之前的内容
- **格式破坏**: 不要添加总结、解释或任何额外文字
- **逻辑跳跃**: 避免突兀的情节转折或不合理的发展

## 强制完整性要求
1. **严格范围**: 必须且仅必须生成第${currentStart}章到第${currentEnd}章的大纲
2. **无缝衔接**: 如果提供了"已有大纲"，必须自然地延续剧情
3. **设定忠实**: 100%遵循小说的核心设定和世界观
4. **格式纯净**: 严格遵守输出格式，无任何杂质

现在，请严格按照上述约束条件，从第${currentStart}章开始，连续生成到第${currentEnd}章结束。确保每一章都完全符合设定要求。
`;

      const plannerApiResponse = await fetch('/api/ai/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeConfigId: activeConfig.id,
          model: activeConfig.model,
          messages: [{ role: 'user', content: outlinePrompt }],
          temperature: settings.temperature,
          stream: true,
        })
      });

      if (!plannerApiResponse.ok) {
        const errorText = await plannerApiResponse.text();
        throw new Error(`Planner AI failed during chapters ${currentStart}-${currentEnd}: ${errorText}`);
      }

      if (!plannerApiResponse.body) {
        throw new Error("响应体为空");
      }

      const reader = plannerApiResponse.body.getReader();
      const decoder = new TextDecoder();
      let chunkContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        plotOutline += chunk;
        chunkContent += chunk;

        updateGenerationContent(plotOutline);
      }

      // Add a newline if it's not the last batch and the content doesn't end with one.
      if (currentEnd < actOneEnd && chunkContent.trim() && !chunkContent.endsWith('\n\n')) {
        plotOutline += '\n\n';
      }
    }

    plotOutline = plotOutline.replace(/```markdown/g, "").replace(/```/g, "").trim();

    if (!plotOutline) throw new Error("未能生成任何章节大纲");

    console.log(`[Act Planner] Batched generation complete. Total chapters: ${actOneEnd - actOneStart + 1}`);

    set({ generationTask: { ...get().generationTask, progress: 40, currentStep: `故事大纲已生成...` } });

    // === STAGE 1C: COMBINE & FINALIZE ===
    set({ generationTask: { ...get().generationTask, progress: 45, currentStep: '阶段3/3: 正在整合最终大纲...' } });

    // 调整顺序：宏观规划在前，逐章细纲在后，使用新的分隔符
    const finalOutline = `${architectContent.trim()}\n\n---\n**逐章细纲**\n---\n\n${plotOutline.trim()}`;

    // 使用现有的处理函数清理最终大纲
    const processedOutline = processOutline(finalOutline);

    await fetch(`/api/novels/${novelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plot_outline: processedOutline })
    });

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
      # 角色设计大师 v1.0

你是一位顶级角色设计师和人物塑造专家，擅长创造立体饱满、富有生命力的小说角色。你的任务是为小说设计核心角色群体，确保每个角色都有独特的魅力和故事价值。

## 核心材料
- **小说名称**: 《${novel.name}》
- **小说类型**: ${novel.genre}
- **故事大纲**: ${processedOutline.substring(0, 2000)}...
- **角色风格指南**: ${characterStyleGuide}
- **角色行为准则**: ${characterRules}

## 角色设计原则

### 1. 角色深度构建
- **多维人格**: 每个角色都要有优点、缺点、矛盾点
- **成长轨迹**: 设计角色在故事中的变化和发展空间
- **内在动机**: 明确角色的核心渴望和恐惧
- **行为逻辑**: 确保角色的行为符合其性格和背景

### 2. 关系网络设计
- **互补性**: 角色之间的性格和能力要形成互补
- **冲突张力**: 设计潜在的矛盾和冲突源
- **情感联系**: 建立角色间的情感纽带和历史关联
- **动态平衡**: 确保角色群体的整体和谐与张力

### 3. 类型化适配
根据小说类型设计相应的角色特质：
- **玄幻/奇幻**: 强调天赋、修为、命运羁绊
- **都市/现实**: 突出职业背景、社会关系、现实困境
- **悬疑/推理**: 重视逻辑能力、观察力、隐秘过往
- **科幻**: 展现科技素养、未来视野、理性思维
- **历史**: 体现时代特色、文化底蕴、历史使命

## 角色创作要求

### 1. 主角设计标准
- **核心设定**: 与小说主题深度结合的独特身份
- **性格魅力**: 既有亲和力又有独特性的人格特质
- **成长潜力**: 在故事发展中有明确的成长轨迹
- **读者代入**: 让目标读者群体产生认同和共鸣

### 2. 配角设计标准
- **功能性**: 每个配角都要在故事中发挥重要作用
- **独特性**: 避免角色功能重复和性格雷同
- **关联性**: 与主角和故事背景有紧密联系
- **发展性**: 预留后续故事发展的空间

### 3. 背景融合要求
- **世界观一致**: 角色背景与小说世界观完美融合
- **时代特色**: 体现故事发生时代的特点
- **社会层次**: 反映故事世界的社会结构
- **文化底蕴**: 展现故事背景的文化特色

## 输出技术规范

### 1. 格式严格要求
- **纯JSON输出**: 不包含任何前言、解释或结尾评论
- **无Markdown**: 不使用代码块或其他格式标记
- **无引导语**: 直接以{开始，以}结束
- **转义处理**: 字符串内双引号必须用\"转义

### 2. 内容质量标准
- **信息密度**: 每个字段都要包含有价值的信息
- **描述具体**: 避免抽象的形容词，使用具体描述
- **逻辑连贯**: 各字段信息要相互支撑，形成完整人物形象
- **创新性**: 避免刻板印象，创造独特的角色特质

### 3. JSON结构规范
{
  "characters": [
    {
      "name": "角色姓名（符合世界观设定）",
      "coreSetting": "核心身份设定（50-80字，突出独特性和与故事的关联）",
      "personality": "性格特点（40-60字，包含优点、缺点和矛盾点）",
      "backgroundStory": "背景故事（80-120字，强调成长经历和与故事世界的融合）"
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
      const generationContext = { plotOutline: processedOutline, characters: [], settings };

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

// 添加辅助函数
function extractArchitectInfo(content: string): { firstActInfo: string; actOneStart: number; actOneEnd: number } {
  // 使用正则表达式提取第一幕信息
  const firstActMatch = content.match(/\*\*第一幕[：:][\s\S]*?(?=\n\n\*\*第二幕[：:]|\s*$)/);
  const firstActInfo = firstActMatch ? firstActMatch[0].trim() : '';


  // 提取章节范围 - 更新正则表达式以匹配更多格式
  const chapterRangeRegex = /章节范围[：:]\s*第(\d+)章[：:\s-]*第(\d+)章/;
  const chapterRangeMatch = content.match(chapterRangeRegex);

  console.log('Chapter range matching:', {
    content: content.substring(0, 200), // 只打印前200个字符避免日志过长
    match: chapterRangeMatch
  });

  const start = chapterRangeMatch ? parseInt(chapterRangeMatch[1]) : 1;
  const end = chapterRangeMatch ? parseInt(chapterRangeMatch[2]) : 70;

  console.log('Extracted chapter range:', { start, end });

  return { firstActInfo, actOneStart: start, actOneEnd: end };
}
