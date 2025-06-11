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
import { log } from 'console';
import { toast } from "sonner";

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
    set({ detailsLoading: true, currentNovel: null, chapters: [], characters: [], plotClues: [], currentNovelDocuments: [] });
    try {
      const novel = await db.novels.get(id);
      if (!novel) throw new Error('Novel not found');

      const chapters = await db.chapters.where('novelId').equals(id).sortBy('chapterNumber');
      const characters = await db.characters.where('novelId').equals(id).toArray();
      const plotClues = await db.plotClues.where('novelId').equals(id).toArray();

      set({
        currentNovel: novel,
        chapters,
        characters,
        plotClues,
        detailsLoading: false,
      });
      return { novel, chapters, characters };
    } catch (error) {
      console.error("Failed to fetch novel details:", error);
      set({ detailsLoading: false });
      return null;
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
          1.  **宏观篇章规划**: 请将这 ${goal} 章的宏大故事划分成 5 到 8 个主要的"篇章"或"卷"。为每个篇章命名，并提供一个 100-200 字的剧情梗概，描述该阶段的核心冲突、主角成长和关键转折点。
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

      // --- STAGE 2: CREATE CHARACTERS ---
      set({ generationTask: { ...get().generationTask, progress: 25, currentStep: '正在根据大纲创建核心人物...' } });

      const charactersPrompt = `
        你是一位角色设计师。请根据以下小说设定和故事大纲，设计 ${settings.maxCharacterCount} 个核心角色。
        - 小说名: 《${novel.name}》
        - 设定: ${novel.genre}, ${novel.style}, ${novel.specialRequirements || '无'}
        - 故事大纲:
        ${plotOutline}
        
        请为每个角色提供姓名、核心设定、性格和背景故事。请确保角色与大纲紧密相关。
        使用以下格式，并用"---"分隔每个角色：
        姓名: [角色姓名]
        核心设定: [角色的关键身份或能力]
        性格: [角色的性格特点]
        背景故事: [角色的背景简介]
        ---
      `;

      const charactersResponse = await openai.chat.completions.create({
        model: activeConfig.model,
        messages: [{ role: 'user', content: charactersPrompt }],
        temperature: settings.characterCreativity,
      });

      const charactersText = charactersResponse.choices[0].message.content;
      if (!charactersText) throw new Error("未能生成人物。");

      const characterBlocks = charactersText.split('---').filter(b => b.trim());
      const newCharacters: Omit<Character, 'id'>[] = characterBlocks.map(block => {
          const nameMatch = block.match(/姓名:\s*(.*)/);
          const coreSettingMatch = block.match(/核心设定:\s*(.*)/);
          const personalityMatch = block.match(/性格:\s*(.*)/);
          const backgroundStoryMatch = block.match(/背景故事:\s*([\s\S]*)/);
          return {
              novelId: novelId,
              name: nameMatch ? nameMatch[1].trim() : '未知',
              coreSetting: coreSettingMatch ? coreSettingMatch[1].trim() : '',
              personality: personalityMatch ? personalityMatch[1].trim() : '',
              backgroundStory: backgroundStoryMatch ? backgroundStoryMatch[1].trim() : '',
              appearance: '', // Can be generated later or left empty
              relationships: '',
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date()
          };
      });

      await db.characters.bulkAdd(newCharacters as Character[]);
      await db.novels.update(novelId, { characterCount: newCharacters.length });
      set({ generationTask: { ...get().generationTask, progress: 40, currentStep: '核心人物创建完毕！' } });

      // --- STAGE 3: GENERATE CHAPTERS ---
      const chaptersToGenerateCount = Math.min(goal, initialChapterGoal);
      const chaptersToGenerate = Array.from({ length: chaptersToGenerateCount }, (_, i) => i);
      const allCharacters = await db.characters.where('novelId').equals(novelId).toArray();
      const generationContext = { plotOutline, characters: allCharacters, settings };

      for (const i of chaptersToGenerate) {
        const chapterProgress = 40 + ((i + 1) / chaptersToGenerateCount) * 60;
        set({
          generationTask: {
            ...get().generationTask,
            progress: Math.floor(chapterProgress),
            currentStep: `正在生成第 ${i + 1} / ${chaptersToGenerateCount} 章...`,
          },
        });
        
        await get().buildNovelIndex(novelId);
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
  generateNewChapter: async (novelId, context, userPrompt) => {
    set({ generatedContent: null });
    
    try {
        const { currentNovel, currentNovelIndex, currentNovelDocuments, chapters } = get();

        if (!currentNovel) throw new Error("Novel not loaded");

        await expandPlotOutline(currentNovel);
        
        const updatedNovel = await db.novels.get(novelId);
        if (!updatedNovel) throw new Error("Failed to re-fetch novel");

        if (!currentNovelIndex) throw new Error("Novel index not loaded");
        
        const { plotOutline, characters, settings } = context;

        const { activeConfigId } = useAIConfigStore.getState();
        if (!activeConfigId) throw new Error("No active AI config");
        
        const activeConfig = await db.aiConfigs.get(activeConfigId);
        if (!activeConfig || !activeConfig.apiKey) throw new Error("Invalid AI config or missing API key");

        const currentChapterNumber = chapters.length + 1;
        const lastChapter = chapters.length > 0 ? chapters[chapters.length - 1] : null;

        const chapterOutlineRegex = new RegExp(`^第${currentChapterNumber}章:\\s*(.*)`, 'm');
        const chapterOutlineMatch = updatedNovel.plotOutline?.match(chapterOutlineRegex);
        const currentChapterOutline = chapterOutlineMatch ? chapterOutlineMatch[1] : '请根据总大纲和上一章结尾，自由发挥，合理推进情节。';
        
        const ragQueryText = `本章大纲: ${currentChapterOutline}\n用户额外要求: ${userPrompt || '无'}`;
        
        const promptEmbedding = await EmbeddingPipeline.embed(ragQueryText);
        const searchResults = currentNovelIndex.search(new Float32Array(promptEmbedding[0]), 5);
        
        const ragContextText = searchResults.neighbors.map(neighbor => {
          const originalDoc = currentNovelDocuments.find(doc => doc.id === neighbor.id);
          return originalDoc 
            ? `相关信息：\n标题: ${originalDoc.title}\n内容: ${originalDoc.text}`
            : '';
        }).filter(Boolean).join('\n\n---\n\n');

        const allCharactersInfo = characters.map(c => `角色: ${c.name} - ${c.coreSetting}`).join('\n');
        const allPlotCluesInfo = get().plotClues.map(p => `- ${p.title}`).join('\n');

        const previousChapterContext = lastChapter
          ? `---
    [上一章的完整内容]
    ${lastChapter.content}
    ---`
          : '--- [这是第一章，请根据大纲开始新的故事。] ---';

        const finalPrompt = `
    你是一位专业的小说家，你的任务是为小说《${currentNovel.name}》续写第 ${currentChapterNumber} 章。
    请直接开始创作，不要写任何总结、解释或提出问题。你的回答应该只有新章节的标题和内容。

    [小说信息]
    - 类型: ${currentNovel.genre}
    - 风格: ${currentNovel.style}
    - 核心要求: ${currentNovel.specialRequirements || '无特殊要求'}

    [总体剧情大纲]
    ${plotOutline}

    [核心人物]
    ${allCharactersInfo}

    [已知情节线索]
    ${allPlotCluesInfo || '暂无，这是故事的开端。'}

    [为增强连贯性，检索到的相关信息]
    ${ragContextText}

    ${previousChapterContext}

    [本章任务]
    1.  **本章大纲**: ${currentChapterOutline}
    2.  **用户额外指令**: ${userPrompt || '无'}
    3.  **预估字数**: ${settings.chapterWordCount} 字左右。

    [重要指令]
    -   请严格按照[本章任务]中的大纲和指令进行创作。
    -   **必须紧密衔接上一章的结尾**，确保故事无缝过渡。
    -   **情节必须有实质性推进**，避免原地踏步或重复之前章节的思考和总结。
    -   **创造独特且有新意的章节结尾**，不要使用套路化的感慨或展望。
    -   **直接输出**: 在第一行提供本章的标题，然后换行，接着撰写新章节的正文内容。不要在标题前添加任何如"标题："或"第X章"等前缀。
    `;

        const openai = new OpenAI({
            apiKey: activeConfig.apiKey,
            baseURL: activeConfig.apiBaseUrl || undefined,
            dangerouslyAllowBrowser: true,
        });

        const SAFE_MAX_TOKENS = 8191;
        let finalMaxTokens = settings.maxTokens;
        if (settings.maxTokens >= SAFE_MAX_TOKENS) {
          finalMaxTokens = SAFE_MAX_TOKENS;
          toast.info(`'max_tokens' 设置过高 (≥ ${SAFE_MAX_TOKENS})`, {
              description: `已自动调整为 ${finalMaxTokens} 以避免API错误。请检查您的AI生成设置。`,
              duration: 8000
          });
        }

        const stream = await openai.chat.completions.create({
          model: activeConfig.model,
          messages: [{ role: 'user', content: finalPrompt }],
          temperature: settings.temperature,
          max_tokens: finalMaxTokens,
          stream: true,
        });

        let newChapterContent = '';
        for await (const chunk of stream) {
          const contentDelta = chunk.choices[0]?.delta?.content || '';
          newChapterContent += contentDelta;
          set({ generatedContent: newChapterContent });
        }
        
        if (!newChapterContent) {
          throw new Error("API did not return any content.");
        }
    } catch (error: any) {
        toast.error(`生成失败: ${error.message || '未知错误'}`);
        // Re-throw the error so the calling function (generateAndSaveNewChapter) can catch it.
        throw error;
    }
  },
  generateAndSaveNewChapter: async (novelId, context, userPrompt) => {
    // Set loading state for the whole process
    set({ generationLoading: true, generatedContent: null });
    try {
      // Step 1: Generate the new chapter content
      await get().generateNewChapter(novelId, context, userPrompt);

      // Step 2: If content was generated, save it
      if (get().generatedContent) {
        await get().saveGeneratedChapter(novelId);
        await get().recordExpansion(novelId);
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
                const parsedJson = JSON.parse(responseContent);
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
}));

const expandPlotOutline = async (novel: Novel) => {
    const { getState } = useNovelStore;
    const { activeConfigId } = useAIConfigStore.getState();
    const activeConfig = activeConfigId ? await db.aiConfigs.get(activeConfigId) : null;

    if (!activeConfig || !activeConfig.apiKey || !novel.plotOutline) {
        console.warn("无法扩展大纲：缺少有效配置或现有大纲。");
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
                const currentNovel = getState().currentNovel;
                if (currentNovel && currentNovel.id === novel.id) {
                    getState().fetchNovelDetails(novel.id!);
                }
                toast.success("AI已构思好新的情节！");
                console.log("大纲扩展成功！");
            }
        } catch (error) {
            console.error("扩展大纲失败:", error);
            toast.error("AI构思后续情节时遇到了点麻烦...");
        }
    }
}; 