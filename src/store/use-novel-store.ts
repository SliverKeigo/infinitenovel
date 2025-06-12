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
    // 移除包裹的markdown代码块（支持json, ```json, ''', ``` 等）
    const cleanedContent = content.replace(/^```(?:json)?\s*|```\s*$/g, '');

    // 尝试直接解析清理后的内容
    try {
        return JSON.parse(cleanedContent);
    } catch (e) {
        // 如果失败，尝试从内容中提取第一个有效的JSON对象
        const jsonMatch = cleanedContent.match(/{\s*["\w\s-]*\s*:\s*[\s\S]*}/);
        if (jsonMatch && jsonMatch[0]) {
            try {
                return JSON.parse(jsonMatch[0]);
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
    userPrompt?: string
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
    set({ detailsLoading: true, currentNovel: null, chapters: [], characters: [], plotClues: [], currentNovelDocuments: [] });
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

        const chapterProgress = 40 + ((i + 1) / chaptersToGenerateCount) * 60;
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

        await get().generateNewChapter(novelId, generationContext);
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
    userPrompt?: string
  ) => {
    set({ generationLoading: true, generatedContent: '' });

    console.log("[诊断] 进入 generateNewChapter 函数。");

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
      segmentsPerChapter = 3,
      maxTokens,
      temperature,
      topP,
      frequencyPenalty,
      presencePenalty,
      contextChapters = 3
    } = settings;

    const novel = get().currentNovel;
    if (!novel) throw new Error("未找到当前小说");

    const { chapters, currentNovelIndex, currentNovelDocuments } = get();
    const latestChapters = chapters.slice(-contextChapters);

    // --- RAG 检索增强 ---
    let retrievedContext = "";
    const nextChapterNumber = (chapters[chapters.length - 1]?.chapterNumber || 0) + 1;
    const chapterOutline = getChapterOutline(plotOutline, nextChapterNumber);

    console.log(`[RAG] 正在为第 ${nextChapterNumber} 章生成内容。`);
    if (chapterOutline) {
      console.log(`[RAG] 获取到章节大纲: "${chapterOutline}"`);
    } else {
      console.warn(`[RAG] 未能为第 ${nextChapterNumber} 章找到剧情大纲。`);
    }

    if (currentNovelIndex && currentNovelDocuments.length > 0 && chapterOutline) {
      try {
        console.log('[RAG] 开始向量检索...');
        const queryEmbedding = (await EmbeddingPipeline.embed([chapterOutline]))[0];
        const searchResults = currentNovelIndex.search(queryEmbedding, 5);

        // The result of search is an object with a 'neighbors' property containing the array of results.
        const retrievedDocs = searchResults.neighbors
          .map((result: { id: string }) => currentNovelDocuments.find((doc: DocumentToIndex) => doc.id === result.id))
          .filter((doc): doc is DocumentToIndex => !!doc);

        if (retrievedDocs.length > 0) {
          retrievedContext = `
### 相关背景资料（系统检索）
以下是根据当前章节大纲从小说知识库中检索到的最相关信息，请在写作时参考：
${retrievedDocs.map((doc: DocumentToIndex) => `- ${doc.title}: ${doc.text.substring(0, 150)}...`).join('\n')}
`;
          console.log(`[RAG] 成功检索到 ${retrievedDocs.length} 条相关信息。`);
        } else {
          console.log('[RAG] 未检索到相关信息。');
        }
      } catch (e) {
        console.error('[RAG] 向量检索失败:', e);
      }
    }
    // --- RAG 结束 ---

    let accumulatedContent = "";

    for (let i = 1; i <= segmentsPerChapter; i++) {
      console.log(`[诊断] 正在生成章节内容 (片段 ${i}/${segmentsPerChapter})...`);

      set({
        generationTask: {
          ...get().generationTask,
          progress: 50 + (50 / segmentsPerChapter) * (i - 1),
          currentStep: `正在生成章节内容 (片段 ${i}/${segmentsPerChapter})...`
        }
      });

      const previousContentContext = accumulatedContent
        ? `到目前为止，本章已经写下的内容如下：\n"""\n${accumulatedContent}\n"""\n请你无缝地接续下去。`
        : "你将要开始撰写本章的开篇。";

      let systemPrompt: string;
      if (i < segmentsPerChapter) {
        systemPrompt = `你是一位经验丰富的小说家，写作风格是【${novel.style}】。${previousContentContext} 请继续撰写下一部分，确保情节连贯，并在一个自然的段落或对话结束时停下来，为后续内容留出空间。不要写完整章的结尾。`;
      } else {
        systemPrompt = `你是一位经验丰富的小说家，写作风格是【${novel.style}】。${previousContentContext} 请撰写本章的最后一部分，将当前的情节推向一个高潮或有力的收尾，可以是一个完整的场景结束，或留下一个引向下一章的悬念。`;
      }

      const userMessageContent = `
        ### 小说信息
        - 小说名称: 《${novel.name}》
        - 类型: ${novel.genre}
        - 特殊要求: ${novel.specialRequirements}

        ### 整体剧情大纲
        ${plotOutline}

        ### 核心角色列表
        ${characters.map(c => `- ${c.name}: ${c.coreSetting}`).join('\n')}

        ### 最近章节回顾
        ${latestChapters.map(c => `第${c.chapterNumber}章 "${c.title}": ${c.summary || c.content.substring(0, 200)}...`).join('\n\n')}

        ${retrievedContext}

        ${userPrompt ? `### 用户本次特别指令\n${userPrompt}\n` : ''}

        请根据以上所有信息，继续你的创作。确保只输出纯粹的小说内容，不要包含任何标题、章节编号或解释性的文字。
      `;


      try {
        const stream = await openai.chat.completions.create({
          model: activeConfig.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessageContent },
          ],
          stream: true,
          max_tokens: maxTokens,
          temperature,
          top_p: topP,
          frequency_penalty: frequencyPenalty,
          presence_penalty: presencePenalty,
        });

        console.log("[诊断] 已成功创建 OpenAI stream，准备接收数据...");

        // Add segment separator
        if (i > 1) {
          set(state => ({ generatedContent: (state.generatedContent || "") + "\n\n" }));
        }

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          set(state => ({ generatedContent: (state.generatedContent || "") + content }));
        }

        console.log("[诊断] OpenAI stream 处理结束。");

        // Update accumulated content after a segment is fully generated
        accumulatedContent = get().generatedContent || "";

      } catch (error) {
        console.error('OpenAI API call failed:', error);
        set({ generationLoading: false, generationTask: { ...get().generationTask, currentStep: "生成失败" } });
        // Re-throw the error to be caught by the calling function
        throw error;
      }
    }

    // 不再这里更新总体进度，只更新加载状态
    set({ generationLoading: false });
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
    // Set loading state for the whole process
    set({ generationLoading: true, generatedContent: null });
    try {
      // Step 1: Generate the new chapter content
      await get().generateNewChapter(novelId, context, userPrompt);

      // Step 2: If content was generated, save it
      if (get().generatedContent) {
        await get().saveGeneratedChapter(novelId);
        await get().recordExpansion(novelId);
        await get().expandPlotOutlineIfNeeded(novelId);
        toast.success("新章节已生成并保存！");
      } else {
        // This case might happen if generation fails and content is null
        toast.warning("内容生成为空，未执行保存。");
      }
    } catch (error) {
      // Error is already handled and toasted inside generateNewChapter
      console.error("An error occurred during the generate-and-save process:", error);
    } finally {
      // Ensure loading is off, even if saving fails for some reason
      set({ generationLoading: false });
    }
  },
  saveGeneratedChapter: async (novelId) => {
    const { generatedContent, chapters, currentNovel, characters } = get();
    if (!generatedContent || !currentNovel) return;

    // --- Step 0: Parse Title and Content ---
    let title = `第 ${(chapters[chapters.length - 1]?.chapterNumber || 0) + 1} 章`;
    let content = generatedContent;
    const firstNewlineIndex = generatedContent.indexOf('\n');

    if (firstNewlineIndex !== -1) {
      const potentialTitle = generatedContent.substring(0, firstNewlineIndex).trim();
      if (potentialTitle.length > 0 && potentialTitle.length < 50) {
        title = potentialTitle;
        content = generatedContent.substring(firstNewlineIndex + 1).trim();
      }
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
            get().fetchNovelDetails(novel.id!);
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