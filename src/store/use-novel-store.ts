import { create } from 'zustand';
import { db } from '@/lib/db';
import type { Novel } from '@/types/novel';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';
import { Voy } from 'voy-search';
import { EmbeddingPipeline } from '@/lib/embeddings';
import { useAIConfigStore } from '@/store/ai-config';
import { useGenerationSettingsStore } from '@/store/generation-settings';
import OpenAI from 'openai';
import { toast } from "sonner";
import type { GenerationSettings } from '@/types/generation-settings';

const INITIAL_CHAPTER_GENERATION_COUNT = 5;
const OUTLINE_EXPAND_THRESHOLD = 3; // 当细纲剩余少于3章时触发扩展
const OUTLINE_EXPAND_CHUNK_SIZE = 10; // 每次扩展10章的细纲

/**
 * 计算大纲字符串中详细章节的数量
 * @param outline - 剧情大纲字符串
 * @returns 详细章节的数量
 */
const countDetailedChaptersInOutline = (outline: string): number => {
  const detailedChapterRegex = /第\d+章:/g;
  const matches = outline.match(detailedChapterRegex);
  return matches ? matches.length : 0;
};

/**
 * 从完整大纲中提取特定章节的剧情摘要
 * @param outline - 剧情大纲字符串
 * @param chapterNumber - 目标章节编号
 * @returns 特定章节的剧情摘要，如果找不到则返回 null
 */
const getChapterOutline = (outline: string, chapterNumber: number): string | null => {
  // 正则表达式匹配 "第X章:" 或 "第 X 章:"，并捕获之后直到下一个 "第X章:" 或字符串结尾的所有内容。
  const regex = new RegExp(`第\\s*${chapterNumber}\\s*章:?([\\s\\S]*?)(?=\\n*第\\s*\\d+\\s*章:|$)`, 'i');
  const match = outline.match(regex);
  return match && match[1] ? match[1].trim() : null;
};

/**
 * 从AI返回的可能包含Markdown代码块的字符串中安全地解析JSON。
 * @param content - AI返回的原始字符串
 * @returns 解析后的JavaScript对象
 * @throws 如果找不到或无法解析JSON，则抛出错误
 */
const parseJsonFromAiResponse = (content: string): any => {
  // 1. 规范化标点符号：将全角标点替换为半角标点，并将内容中的引号转义
  const normalizedContent = content
    .replace(/｛/g, '{')
    .replace(/｝/g, '}')
    .replace(/：/g, ':')
    .replace(/，/g, ',')
    .replace(/“/g, '\\"') // Convert to escaped quote
    .replace(/”/g, '\\"') // Convert to escaped quote
    .replace(/‘/g, '\\"') // Convert to escaped quote
    .replace(/’/g, '\\"') // Convert to escaped quote

  // 2. 移除包裹的markdown代码块
  const cleanedContent = normalizedContent.replace(/^```(?:json)?\s*|```\s*$/g, '');

  // 3. 尝试直接解析清理后的内容
  try {
    return JSON.parse(cleanedContent);
  } catch (e) {
    // 如果失败，尝试从内容中提取第一个有效的JSON对象
    // This is a more robust way to extract JSON from a string that might have leading/trailing text.
    const firstBracket = cleanedContent.indexOf('{');
    const lastBracket = cleanedContent.lastIndexOf('}');

    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const jsonString = cleanedContent.substring(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(jsonString);
      } catch (finalError) {
        console.error("Failed to parse extracted JSON:", finalError);
        throw new Error(`AI返回了无效的JSON格式，即使在清理和提取后也无法解析: ${content}`);
      }
    }
  }
  throw new Error(`在AI响应中未找到有效的JSON内容: ${content}`);
};

interface DocumentToIndex {
  id: string;
  title: string;
  text: string;
}

interface GenerationTask {
  isActive: boolean;
  progress: number;
  currentStep: string;
  novelId: number | null;
}

interface NovelState {
  novels: Novel[];
  loading: boolean;
  currentNovel: Novel | null;
  currentNovelIndex: Voy | null;
  currentNovelDocuments: DocumentToIndex[];
  chapters: Chapter[];
  characters: Character[];
  plotClues: PlotClue[];
  detailsLoading: boolean;
  indexLoading: boolean;
  generationLoading: boolean;
  generatedContent: string | null;
  generationTask: GenerationTask;
  fetchNovels: () => Promise<void>;
  fetchNovelDetails: (id: number) => Promise<{ novel: Novel; chapters: Chapter[]; characters: Character[] } | null>;
  buildNovelIndex: (id: number, onSuccess?: () => void) => Promise<void>;
  generateNewChapter: (
    novelId: number,
    context: {
      plotOutline: string;
      characters: Character[];
      settings: any; // Using 'any' for now, replace with GenerationSettings
    },
    userPrompt: string | undefined,
    chapterToGenerate: number,
  ) => Promise<void>;
  generateAndSaveNewChapter: (
    novelId: number,
    context: {
      plotOutline: string;
      characters: Character[];
      settings: any;
    },
    userPrompt?: string
  ) => Promise<void>;
  generateNovelChapters: (novelId: number, goal: number, initialChapterGoal?: number) => Promise<void>;
  saveGeneratedChapter: (novelId: number) => Promise<void>;
  addNovel: (novel: Omit<Novel, 'id' | 'createdAt' | 'updatedAt' | 'wordCount' | 'chapterCount' | 'characterCount' | 'expansionCount' | 'plotOutline' | 'plotClueCount'>) => Promise<number | undefined>;
  deleteNovel: (id: number) => Promise<void>;
  recordExpansion: (novelId: number) => Promise<void>;
  expandPlotOutlineIfNeeded: (novelId: number) => Promise<void>;
}

export const useNovelStore = create<NovelState>((set, get) => ({
  novels: [],
  loading: true,
  currentNovel: null,
  currentNovelIndex: null,
  currentNovelDocuments: [],
  chapters: [],
  characters: [],
  plotClues: [],
  detailsLoading: true,
  indexLoading: false,
  generationLoading: false,
  generatedContent: null,
  generationTask: {
    isActive: false,
    progress: 0,
    currentStep: '空闲',
    novelId: null,
  },
  fetchNovels: async () => {
    set({ loading: true });
    const novels = await db.novels.orderBy('updatedAt').reverse().toArray();
    set({ novels, loading: false });
  },
  fetchNovelDetails: async (id) => {
    console.time('fetchNovelDetails Execution');
    set({ detailsLoading: true });
    try {
      console.time('数据库查询');
      const novel = await db.novels.get(id);
      if (!novel) throw new Error('Novel not found');

      const chapters = await db.chapters.where('novelId').equals(id).sortBy('chapterNumber');
      const characters = await db.characters.where('novelId').equals(id).toArray();
      const plotClues = await db.plotClues.where('novelId').equals(id).toArray();
      const savedIndexRecord = await db.novelVectorIndexes.get({ novelId: id });
      console.timeEnd('数据库查询');

      // 新增：尝试加载已保存的向量索引
      let voyIndex: Voy | null = null;
      if (savedIndexRecord && savedIndexRecord.indexDump) {
        try {
          console.time('向量索引反序列化');
          voyIndex = Voy.deserialize(savedIndexRecord.indexDump);
          console.timeEnd('向量索引反序列化');
          console.log(`成功为小说ID ${id} 加载了已保存的向量索引。`);
        } catch (e) {
          console.error(`为小说ID ${id} 加载向量索引失败:`, e);
        }
      }

      set({
        currentNovel: novel,
        chapters,
        characters,
        plotClues,
        detailsLoading: false,
        currentNovelIndex: voyIndex, // 设置加载到的索引或null
      });
      return { novel, chapters, characters };
    } catch (error) {
      console.error("Failed to fetch novel details:", error);
      set({ detailsLoading: false });
      return null;
    } finally {
      console.timeEnd('fetchNovelDetails Execution');
    }
  },
  buildNovelIndex: async (id, onSuccess) => {
    set({ indexLoading: true, currentNovelIndex: null });
    try {
      const fetchedData = await get().fetchNovelDetails(id);

      if (!fetchedData) {
        throw new Error('Failed to fetch novel data for indexing.');
      }

      const { chapters, characters } = fetchedData;
      const plotClues = await db.plotClues.where('novelId').equals(id).toArray();

      const documentsToIndex: DocumentToIndex[] = [];

      chapters.forEach(c => documentsToIndex.push({
        id: `chapter-${c.id}`,
        title: `第${c.chapterNumber}章`,
        text: c.summary || c.content.substring(0, 500)
      }));

      characters.forEach(c => documentsToIndex.push({
        id: `character-${c.id}`,
        title: c.name,
        text: `姓名: ${c.name}, 核心设定: ${c.coreSetting}, 性格: ${c.personality}, 背景: ${c.backgroundStory}`
      }));

      plotClues.forEach(p => documentsToIndex.push({
        id: `plot-${p.id}`,
        title: p.title,
        text: p.description
      }));

      set({ currentNovelDocuments: documentsToIndex });

      if (documentsToIndex.length === 0) {
        set({ currentNovelIndex: new Voy(), indexLoading: false });
        console.warn("Building an empty index as there are no chapters or characters.");
        onSuccess?.();
        return;
      }

      const embeddings = await EmbeddingPipeline.embed(documentsToIndex.map(d => d.text));

      const dataForVoy = documentsToIndex.map((doc, i) => ({
        id: doc.id,
        title: doc.title,
        url: `#${doc.id}`,
        embeddings: embeddings[i],
      }));

      const newIndex = new Voy({ embeddings: dataForVoy });

      set({ currentNovelIndex: newIndex, indexLoading: false });

      // 新增：将新创建的索引持久化到数据库
      try {
        const serializedIndex = newIndex.serialize();
        // 使用 put 并指定 novelId 作为查找键，实现覆盖更新
        await db.novelVectorIndexes.put({
          novelId: id,
          indexDump: serializedIndex,
        });
        console.log(`成功为小说ID ${id} 保存了向量索引。`);
      } catch (e) {
        console.error(`为小说ID ${id} 保存向量索引失败:`, e);
      }

      onSuccess?.();

    } catch (error: any) {
      console.error("Failed to build novel index:", error);
      set({ indexLoading: false });
    }
  },
  generateNovelChapters: async (novelId, goal, initialChapterGoal = 5) => {
    set({
      generationTask: {
        isActive: true,
        progress: 0,
        currentStep: '正在初始化任务...',
        novelId: novelId,
      },
    });

    try {
      // Step 0: Get Settings, Config and Novel Info
      const settings = await useGenerationSettingsStore.getState().getSettings();
      if (!settings) {
        throw new Error("生成设置未找到，请先在设置页面配置。");
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

      const OUTLINE_THRESHOLD = 50;
      let outlinePrompt: string;

      if (goal > OUTLINE_THRESHOLD) {
        // For long stories, generate a hierarchical outline
        outlinePrompt = `
          你是一位经验丰富的小说编辑和世界构建大师。请为一部名为《${novel.name}》的宏大长篇小说创作一个分层的故事大纲。
          - 小说类型: ${novel.genre}
          - 写作风格: ${novel.style}
          - 计划总章节数: ${goal}
          - 核心设定与特殊要求: ${novel.specialRequirements || '无'}

          请分两步完成：
          1.  **宏观篇章规划**: 请将这 ${goal} 章的宏大故事划分成 3 到 5 个主要的"篇章"或"卷"。为每个篇章命名，并提供一个 100-200 字的剧情梗概，描述该阶段的核心冲突、主角成长和关键转折点。
          2.  **开篇章节细纲**: 在完成宏观规划后，请为故事最开始的 ${initialChapterGoal} 章提供逐章的、更加详细的剧情摘要（每章约 50-100 字）。

          请确保两部分内容都在一次响应中完成，并且格式清晰。先输出所有宏观篇章，然后另起一段输出开篇的章节细纲。
          重要提醒：你的唯一任务是生成逐章大纲。绝对禁止返回任何形式的小说简介或摘要。请严格、无条件地遵守"第X章: [内容]"的格式进行输出。
        `;
      } else {
        // For shorter stories, generate a direct chapter-by-chapter outline
        outlinePrompt = `
          你是一位经验丰富的小说编辑。请为一部名为《${novel.name}》的小说创作一个详细的章节大纲。
          - 小说类型: ${novel.genre}
          - 写作风格: ${novel.style}
          - 目标总章节数: ${goal}
          - 核心设定与特殊要求: ${novel.specialRequirements || '无'}
          
          请为从第1章到第${goal}章的每一章都提供一个简洁的剧情摘要。
          请确保大纲的连贯性和完整性。直接开始输出第一章的大纲。
          格式如下：
          第1章: [剧情摘要]
          第2章: [剧情摘要]
          ...
          重要提醒：你的唯一任务是生成逐章大纲。绝对禁止返回任何形式的小说简介或摘要。请严格、无条件地遵守"第X章: [内容]"的格式进行输出。
        `;
      }

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

      const plotOutline = outlineResponse.choices[0].message.content;
      if (!plotOutline) throw new Error("未能生成大纲。");

      await db.novels.update(novelId, { plotOutline });
      set({ generationTask: { ...get().generationTask, progress: 20, currentStep: '大纲创建完毕！' } });

      // --- STAGE 1.5: CREATE NOVEL DESCRIPTION ---
      set({ generationTask: { ...get().generationTask, progress: 22, currentStep: '正在生成小说简介...' } });
      const descriptionPrompt = `
        你是一位卓越的营销文案专家。请根据以下小说的核心信息，为其创作一段 150-250 字的精彩简介。
        这段简介应该引人入胜，能够吸引读者，让他们渴望立即开始阅读。请突出故事的核心冲突、独特设定和悬念。
        
        - 小说名称: 《${novel.name}》
        - 小说类型: ${novel.genre}
        - 写作风格: ${novel.style}
        - 故事大纲: ${plotOutline.substring(0, 1500)}...
        
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

      const characterPrompt = `
        你是一位顶级角色设计师。基于下面的小说信息和故事大纲，设计出引人入胜的核心角色。
        - 小说名称: 《${novel.name}》
        - 小说类型: ${novel.genre}
        - 故事大纲: ${plotOutline.substring(0, 2000)}...

        请根据以上信息，为这部小说创建 5 个核心角色。

        请严格按照下面的JSON格式输出，返回一个包含 "characters" 键的JSON对象。不要包含任何额外的解释或文本。
        {
          "characters": [
            {
              "name": "角色名",
              "coreSetting": "一句话核心设定，例如'一个拥有神秘过去的退休星际战士'",
              "personality": "角色的性格特点，用几个关键词描述",
              "backgroundStory": "角色的背景故事简述"
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
        },
      });

    } catch (error) {
      console.error("Failed to generate novel chapters:", error);
      set({
        generationTask: {
          isActive: false,
          progress: get().generationTask.progress,
          currentStep: `生成失败: ${error instanceof Error ? error.message : '未知错误'}`,
          novelId: novelId,
        },
      });
    }
  },
  generateNewChapter: async (
    novelId: number,
    context: {
      plotOutline: string;
      characters: Character[];
      settings: GenerationSettings;
    },
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
    } = settings;

    const novel = get().currentNovel;
    if (!novel) throw new Error("未找到当前小说");

    const { chapters, currentNovelIndex, currentNovelDocuments } = get();

    // --- RAG 检索增强 (用于章节解构) ---
    const nextChapterNumber = chapterToGenerate;
    const chapterOutline = getChapterOutline(plotOutline, nextChapterNumber);

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

    console.log(`[章节解构] 正在为第 ${nextChapterNumber} 章生成场景规划。`);
    if (!chapterOutline) {
      const errorMsg = `未能为第 ${nextChapterNumber} 章找到剧情大纲，无法进行章节解构。`;
      console.warn(`[章节解构] ${errorMsg}`);
      toast.error(errorMsg);
      set({ generationLoading: false });
      return;
    }

    // 步骤 1: 章节解构，获取标题和场景列表
    let chapterTitle = "";
    let chapterScenes: string[] = [];

    try {
      const decompositionPrompt = `
你是一个经验丰富的小说编剧。你的任务是为一部小说创作具体的章节。
核心任务：为《${novel.name}》的第 ${nextChapterNumber} 章进行规划。

${previousChapterContext}

本章的核心剧情摘要如下：
---
${chapterOutline}
---
请根据以上所有信息，完成以下两件事：
1.  为本章起一个引人入胜的标题。
2.  将本章的故事情节分解成 ${settings.segmentsPerChapter} 个连贯的、循序渐进的场景（Scene）。每个场景请用一句话简要描述。

请严格按照以下JSON格式返回，不要包含任何额外的解释或Markdown标记：
{
  "title": "章节标题",
  "scenes": [
    "场景1的简要描述",
    "场景2的简要描述",
    "场景3的简要描述"
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
      chapterScenes = decompResult.scenes;

      if (!chapterTitle || !chapterScenes || chapterScenes.length === 0) {
        throw new Error("AI未能返回有效的章节标题或场景列表。");
      }
      console.log(`[章节解构] 成功规划出 ${chapterScenes.length} 个场景。`);

    } catch (e) {
      console.error("[章节解构] 失败:", e);
      toast.error(`章节规划失败: ${e instanceof Error ? e.message : '未知错误'}`);
      set({ generationLoading: false });
      return;
    }

    // 步骤 2: 逐场景生成内容
    let accumulatedContent = "";
    let completedScenesContent = "";

    set({ generatedContent: "" }); // 清空预览

    for (let i = 0; i < chapterScenes.length; i++) {
      const sceneDescription = chapterScenes[i];
      set({
        generationTask: {
          ...get().generationTask,
          currentStep: `生成第 ${nextChapterNumber} 章 - 场景 ${i + 1}/${chapterScenes.length}: ${sceneDescription}`,
        },
      });

      const targetTotalWords = 3000;
      const scenesCount = settings.segmentsPerChapter > 0 ? settings.segmentsPerChapter : 3; // Fallback to 3 scenes
      const wordsPerSceneLower = Math.round((targetTotalWords / scenesCount) * 0.85);
      const wordsPerSceneUpper = Math.round((targetTotalWords / scenesCount) * 1.15);

      const scenePrompt = `
你是一位顶级小说家，正在创作《${novel.name}》的第 ${nextChapterNumber} 章，标题是"${chapterTitle}"。
你的写作风格是：【${novel.style}】。

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
          set(state => ({ generatedContent: (state.generatedContent || "") + "\n\n" }));
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
            set(state => ({ generatedContent: (state.generatedContent || "") + token }));
            currentSceneContent += token;
          }
        }
        // 当前场景流式结束后，将其完整内容更新到内部累积器中
        completedScenesContent += (i > 0 ? "\n\n" : "") + currentSceneContent;

      } catch (error) {
        console.error(`[场景生成] 场景 ${i + 1} 失败:`, error);
        toast.error(`生成场景 ${i + 1} 时出错，章节生成中止。`);
        set({ generationLoading: false });
        return;
      }
    }

    // 步骤 3: 整合最终结果
    // 此刻 generatedContent 已经包含了完整的、流式生成的所有章节正文
    const finalBody = get().generatedContent || "";
    const finalContent = `${chapterTitle}\n|||CHAPTER_SEPARATOR|||\n${finalBody}`;
    set({ generatedContent: finalContent, generationLoading: false });
  },
  generateAndSaveNewChapter: async (
    novelId: number,
    context: {
      plotOutline: string;
      characters: Character[];
      settings: any;
    },
    userPrompt?: string
  ) => {
    set({ generationLoading: true, generatedContent: null });
    try {
      // 步骤 1: 检查并扩展大纲
      await get().expandPlotOutlineIfNeeded(novelId);

      // 步骤 2: 获取最新上下文（因为大纲可能已更新）
      const currentNovel = get().currentNovel;
      const characters = get().characters;
      const settings = await useGenerationSettingsStore.getState().getSettings();

      if (!currentNovel || !currentNovel.plotOutline || !settings) {
        toast.error("续写失败：无法获取必要的小说信息或设置。");
        set({ generationLoading: false });
        return;
      }

      const context = {
        plotOutline: currentNovel.plotOutline,
        characters: characters,
        settings: settings,
      };

      // 步骤 3: 生成新章节内容
      const nextChapterNumber = (get().chapters.length || 0) + 1;
      await get().generateNewChapter(novelId, context, userPrompt, nextChapterNumber);

      // 步骤 4: 保存生成的章节
      if (get().generatedContent) {
        await get().saveGeneratedChapter(novelId);
        await get().recordExpansion(novelId);
        toast.success("新章节已生成并保存！");
      } else {
        toast.warning("内容生成为空，未执行保存。");
      }
    } catch (error) {
      console.error("An error occurred during the generate-and-save process:", error);
      toast.error(`续写章节时发生错误: ${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      set({ generationLoading: false });
    }
  },
  saveGeneratedChapter: async (novelId) => {
    const { generatedContent, chapters, currentNovel, characters } = get();
    if (!generatedContent || !currentNovel) return;

    // --- Step 0: Parse Title and Content from separator ---
    let title: string;
    let content: string;
    const separator = '|||CHAPTER_SEPARATOR|||';
    const parts = generatedContent.split(separator);

    if (parts.length >= 2) {
      title = parts[0].trim();
      content = parts[1].trim();
    } else {
      // 智能回退逻辑
      console.warn("Separator not found. Activating smart fallback.");
      const lines = generatedContent.split('\n');
      const potentialTitle = lines[0].trim();

      if (potentialTitle && lines.length > 1) {
        title = `${potentialTitle} (兼容模式)`;
        content = lines.slice(1).join('\n').trim();
        toast.info("AI未完全遵守格式，已通过兼容模式成功解析。");
      } else {
        // 最终兜底
        toast.error("AI返回格式完全无法识别，章节保存失败。");
        title = `第 ${(chapters[chapters.length - 1]?.chapterNumber || 0) + 1} 章 (格式严重错误)`;
        content = generatedContent;
      }
    }

    if (!content) {
      toast.error("AI返回的内容为空，无法保存。");
      return;
    }

    // --- Step 1: Save the new chapter text first ---
    const newChapterNumber = (chapters[chapters.length - 1]?.chapterNumber || 0) + 1;
    const newChapter: Omit<Chapter, 'id'> = {
      novelId,
      chapterNumber: newChapterNumber,
      title: title,
      content: content,
      summary: content.substring(0, 200),
      status: 'draft',
      wordCount: content.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.chapters.add(newChapter as Chapter);

    // --- Step 2: Post-generation Analysis for new characters and plot clues ---
    let newCharacters: Omit<Character, "id">[] = [];
    let newClues: Omit<PlotClue, "id">[] = [];
    try {
      const { activeConfigId } = useAIConfigStore.getState();
      const activeConfig = activeConfigId ? await db.aiConfigs.get(activeConfigId) : null;

      // 子任务状态上报
      const currentTask = get().generationTask;
      if (currentTask.isActive) {
        set({ generationTask: { ...currentTask, currentStep: '正在分析新角色与线索...' } });
      }

      if (activeConfig && activeConfig.apiKey) {
        const openai = new OpenAI({
          apiKey: activeConfig.apiKey,
          baseURL: activeConfig.apiBaseUrl || undefined,
          dangerouslyAllowBrowser: true,
        });

        const analysisPrompt = `
              你是一位目光如炬的文学分析师和图书管理员。

              已知信息:
              1. 小说名: 《${currentNovel.name}》
              2. 当前已知的角色列表: [${characters.map(c => `"${c.name}"`).join(', ')}]
              3. 刚刚生成的新章节内容:
              """
              ${content.substring(0, 4000)}
              """

              你的任务:
              请仔细阅读上面的新章节内容，并以一个 JSON 对象的格式，返回你的分析结果。这个 JSON 对象应包含两个键： "newCharacters" 和 "newPlotClues"。

              1. "newCharacters": 这是一个数组。请找出章节中所有被明确提及、且不在"当前已知角色列表"中的新人物。如果章节中没有新人物，则返回一个空数组 []。对于每一个新人物，提供一个包含以下字段的对象：
                  - "name": 新人物的姓名。
                  - "coreSetting": 根据本章内容，用一句话描述他/她的身份或核心作用 (例如："黑风寨的三当家", "神秘的炼丹老人")。
                  - "initialRelationship": 根据本章内容，描述他/她与主角团的初次互动或关系 (例如："与主角发生冲突", "向主角发布了一个任务", "似乎在暗中观察主角")。

              2. "newPlotClues": 这是一个数组。请找出章节中新出现的、可能对未来剧情有影响的关键线索、物品、事件或未解之谜。如果章节中没有新线索，则返回一个空数组 []。对于每一个新线索，提供一个包含以下字段的对象：
                  - "title": 线索的简短标题 (例如："神秘的黑色铁片", "城东的废弃矿洞")。
                  - "description": 对线索的详细描述，并解释其潜在的重要性。

              请严格按照此 JSON 格式返回，不要添加任何额外的解释或 Markdown 标记。
            `;

        const analysisResponse = await openai.chat.completions.create({
          model: activeConfig.model,
          messages: [{ role: 'user', content: analysisPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.3,
        });

        const responseContent = analysisResponse.choices[0].message.content;
        if (responseContent) {
          const parsedJson = parseJsonFromAiResponse(responseContent);
          const extractedCharacters = parsedJson.newCharacters || [];
          const extractedClues = parsedJson.newPlotClues || [];

          if (Array.isArray(extractedCharacters)) {
            newCharacters = extractedCharacters.map((char: any) => ({
              novelId,
              name: char.name || '未知姓名',
              coreSetting: char.coreSetting || '无设定',
              personality: '',
              backgroundStory: char.initialRelationship ? `初次登场关系：${char.initialRelationship}` : '',
              appearance: '',
              relationships: '',
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
          }

          if (Array.isArray(extractedClues)) {
            newClues = extractedClues.map((clue: any) => ({
              novelId,
              title: clue.title || '无标题线索',
              description: clue.description || '无描述',
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
          }

          if (newCharacters.length > 0) {
            toast.success(`发现了 ${newCharacters.length} 位新角色！`);
            await db.characters.bulkAdd(newCharacters as Character[]);
          }
          if (newClues.length > 0) {
            toast.success(`发现了 ${newClues.length} 条新线索！`);
            await db.plotClues.bulkAdd(newClues as PlotClue[]);
          }
        }
      }
    } catch (error) {
      console.error("Failed to analyze chapter for new elements:", error);
      toast.error("分析新章节时出错，但章节已保存。");
    }

    // --- Step 3: Update novel statistics ---
    await db.novels.update(novelId, {
      chapterCount: currentNovel.chapterCount + 1,
      wordCount: currentNovel.wordCount + content.length,
      characterCount: (currentNovel.characterCount || 0) + newCharacters.length,
      plotClueCount: (currentNovel.plotClueCount || 0) + newClues.length,
      updatedAt: new Date(),
    });

    // --- Step 4: Refresh state ---
    await get().fetchNovelDetails(novelId);
    set({ generatedContent: null });
  },
  addNovel: async (novelData) => {
    // novelData 的类型是 Omit<Novel, ...>，只包含Novel本身的属性
    const newNovel: Omit<Novel, 'id'> = {
      ...novelData,
      wordCount: 0,
      chapterCount: 0,
      characterCount: 0,
      expansionCount: 0,
      plotOutline: '',
      plotClueCount: 0,
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      specialRequirements: novelData.specialRequirements || '',
    };
    const newId = await db.novels.add(newNovel as Novel);
    await get().fetchNovels();
    return newId;
  },
  deleteNovel: async (id) => {
    await db.novels.delete(id);
    await db.chapters.where('novelId').equals(id).delete();
    await db.characters.where('novelId').equals(id).delete();
    await db.plotClues.where('novelId').equals(id).delete();
    set((state) => ({
      novels: state.novels.filter((novel) => novel.id !== id),
    }));
  },
  recordExpansion: async (novelId: number) => {
    const novel = await db.novels.get(novelId);
    if (novel) {
      await db.novels.update(novelId, {
        expansionCount: novel.expansionCount + 1,
        updatedAt: new Date(),
      });
      await get().fetchNovelDetails(novelId);
    }
  },
  expandPlotOutlineIfNeeded: async (novelId: number) => {
    const { activeConfigId } = useAIConfigStore.getState();
    const activeConfig = activeConfigId ? await db.aiConfigs.get(activeConfigId) : null;
    const novel = await db.novels.get(novelId);

    if (!novel || !activeConfig || !activeConfig.apiKey || !novel.plotOutline) {
      console.warn("无法扩展大纲：缺少小说、有效配置或现有大纲。");
      return;
    }

    const currentChapterCount = novel.chapterCount;
    const detailedChaptersInOutline = countDetailedChaptersInOutline(novel.plotOutline);

    console.log(`扩展检查：当前章节 ${currentChapterCount}, 大纲中章节 ${detailedChaptersInOutline}`);

    if (detailedChaptersInOutline >= novel.totalChapterGoal) {
      console.log("大纲已完成，无需扩展。");
      return;
    }

    if (detailedChaptersInOutline - currentChapterCount < OUTLINE_EXPAND_THRESHOLD) {
      toast.info("AI正在思考后续情节，请稍候...");
      console.log("触发大纲扩展...");

      const openai = new OpenAI({
        apiKey: activeConfig.apiKey,
        baseURL: activeConfig.apiBaseUrl || undefined,
        dangerouslyAllowBrowser: true,
      });

      const expansionPrompt = `
          你是一位正在续写自己史诗级作品《${novel.name}》的小说家。
          
          这是我们共同确定的、贯穿整个故事的宏观篇章规划和已有的详细大纲：
          ---
          ${novel.plotOutline}
          ---
          任务: 
          我们已经完成了前 ${currentChapterCount} 章的创作。现在，请你基于已有的宏观规划和剧情，为故事紧接着生成从第 ${detailedChaptersInOutline + 1} 章到第 ${detailedChaptersInOutline + OUTLINE_EXPAND_CHUNK_SIZE} 章的详细剧情摘要。
          
          请确保新的细纲与前面的剧情无缝衔接，并稳步推进核心情节。
          请只返回新增的这 ${OUTLINE_EXPAND_CHUNK_SIZE} 章细纲，格式为"第X章: [剧情摘要]"，不要重复任何已有内容或添加额外解释。
        `;

      try {
        const response = await openai.chat.completions.create({
          model: activeConfig.model,
          messages: [{ role: 'user', content: expansionPrompt }],
          temperature: 0.6,
        });

        const newOutlinePart = response.choices[0].message.content;
        if (newOutlinePart) {
          const updatedOutline = `${novel.plotOutline}\n${newOutlinePart.trim()}`;
          await db.novels.update(novel.id!, { plotOutline: updatedOutline });
          // 更新 Zustand store 中的 currentNovel
          const currentNovel = get().currentNovel;
          if (currentNovel && currentNovel.id === novel.id) {
            await get().fetchNovelDetails(novel.id!);
          }
          toast.success("AI已构思好新的情节！");
          console.log("大纲扩展成功！");
        }
      } catch (error) {
        console.error("扩展大纲失败:", error);
        toast.error("AI构思后续情节时遇到了点麻烦...");
      }
    }
  },
})); 