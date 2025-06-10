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
  buildNovelIndex: (id: number) => Promise<void>;
  generateNewChapter: (
    novelId: number, 
    context: {
      plotOutline: string;
      characters: Character[];
      settings: any; // Using 'any' for now, replace with GenerationSettings
    },
    userPrompt?: string
  ) => Promise<void>;
  generateNovelChapters: (novelId: number, goal: number) => Promise<void>;
  saveGeneratedChapter: (novelId: number) => Promise<void>;
  addNovel: (novel: Omit<Novel, 'id' | 'createdAt' | 'updatedAt' | 'wordCount' | 'chapterCount' | 'characterCount' | 'expansionCount' | 'plotOutline' | 'plotClueCount'>) => Promise<number | undefined>;
  deleteNovel: (id: number) => Promise<void>;
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
  buildNovelIndex: async (id) => {
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

    } catch (error: any) {
      console.error("Failed to build novel index:", error);
      set({ indexLoading: false });
    }
  },
  generateNovelChapters: async (novelId, goal) => {
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
      
      const outlinePrompt = `
        你是一位经验丰富的小说编辑。请为一部名为《${novel.name}》的小说创作一个详细的章节大纲。
        - 小说类型: ${novel.genre}
        - 写作风格: ${novel.style}
        - 目标总章节数: ${novel.totalChapterGoal}
        - 核心设定与特殊要求: ${novel.specialRequirements || '无'}
        
        请为从第1章到第${novel.totalChapterGoal}章的每一章都提供一个简洁的剧情摘要。
        请确保大纲的连贯性和完整性。直接开始输出第一章的大纲。
        格式如下：
        第1章: [剧情摘要]
        第2章: [剧情摘要]
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
      const chaptersToGenerate = Array.from({ length: goal }, (_, i) => i);
      const allCharacters = await db.characters.where('novelId').equals(novelId).toArray();
      const generationContext = { plotOutline, characters: allCharacters, settings };

      for (const i of chaptersToGenerate) {
        const chapterProgress = 40 + ((i + 1) / goal) * 60;
        set({
          generationTask: {
            ...get().generationTask,
            progress: chapterProgress,
            currentStep: `正在生成第 ${i + 1} / ${goal} 章...`,
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
    set({ generationLoading: true, generatedContent: null });
    const { currentNovel, currentNovelIndex, currentNovelDocuments, chapters } = get();
    if (!currentNovel || !currentNovelIndex) {
      console.error("Novel or index not loaded.");
      set({ generationLoading: false });
      return;
    }
    
    const { plotOutline, characters, settings } = context;

    console.log("Generating new chapter for novel ID:", novelId);

    // 1. 获取激活的AI配置
    const { activeConfigId } = useAIConfigStore.getState();

    console.log("Active config ID:", activeConfigId);

    if (!activeConfigId) {
      // In batch generation mode, we don't show alerts
      if (!get().generationTask.isActive) alert("请先设置并激活一个AI配置。");
      set({ generationLoading: false });
      return;
    }
    const activeConfig = await db.aiConfigs.get(activeConfigId);
    if (!activeConfig || !activeConfig.apiKey) {
      if (!get().generationTask.isActive) alert("激活的AI配置无效或缺少API密钥。");
      set({ generationLoading: false });
      return;
    }

    console.log("Active config:", activeConfig);
    
    let finalUserPrompt: string;
    let ragQueryText: string;

    if (userPrompt && userPrompt.trim()) {
      // 手动模式
      finalUserPrompt = userPrompt;
      ragQueryText = userPrompt;
    } else {
      // Agent 模式 (Batch Generation)
      const currentChapterNumber = chapters.length + 1;
      const outlineLines = plotOutline.split('\n');
      const chapterOutline = outlineLines.find(line => line.startsWith(`第${currentChapterNumber}章:`)) || `续写故事，推进情节发展。`;

      if (chapters.length === 0) {
        // 生成第一章
        finalUserPrompt = `你是一位专业的小说家，请根据以下设定和第一章的大纲，为小说《${currentNovel.name}》创作第一章的内容（约 ${settings.chapterWordCount} 字）。请直接开始正文，无需章节标题。\n\n- 类型: ${currentNovel.genre}\n- 风格: ${currentNovel.style}\n- 核心要求: ${currentNovel.specialRequirements || '无特殊要求'}\n- 第一章大纲: ${chapterOutline}`;
        ragQueryText = `小说《${currentNovel.name}》的核心设定和第一章剧情: ${chapterOutline}`;
      } else {
        // 生成后续章节
        const relevantChapters = chapters.slice(-settings.contextChapters);
        const prevChaptersContext = relevantChapters.map(c => `第${c.chapterNumber}章摘要: ${c.summary || c.content.slice(0, 200)}`).join('\n');
        finalUserPrompt = `你是一位专业的小说家，请紧接上一章的内容，根据本章大纲，为小说《${currentNovel.name}》续写第 ${currentChapterNumber} 章（约 ${settings.chapterWordCount} 字）。请保持故事的连贯性和一致性。\n\n- 先前章节概要:\n${prevChaptersContext}\n\n- 本章大纲: ${chapterOutline}`;
        ragQueryText = `承接前文，续写 ${chapterOutline}`;
      }
    }

    console.log("Final user prompt:", finalUserPrompt);
    console.log("RAG query text:", ragQueryText);

    const openai = new OpenAI({
        apiKey: activeConfig.apiKey,
        baseURL: activeConfig.apiBaseUrl || undefined,
        dangerouslyAllowBrowser: true,
    });

    console.log("OpenAI instance created");

    // 2. RAG - 检索
    const promptEmbedding = await EmbeddingPipeline.embed(ragQueryText);
    const searchResults = currentNovelIndex.search(new Float32Array(promptEmbedding[0]), 5);
    
    // 3. RAG - 增强上下文
    const contextText = searchResults.neighbors.map(neighbor => {
      const originalDoc = currentNovelDocuments.find(doc => doc.id === neighbor.id);
      return originalDoc 
        ? `相关信息：\n标题: ${originalDoc.title}\n内容: ${originalDoc.text}`
        : '';
    }).filter(Boolean).join('\n\n---\n\n');

    console.log("Context text:", contextText);
    
    const allCharactersInfo = characters.map(c => `角色: ${c.name} - ${c.coreSetting}`).join('\n');
    const allPlotCluesInfo = get().plotClues.map(p => `- ${p.title}`).join('\n');

    const finalPrompt = `
      你是一位出色的小说家。请基于以下背景信息和用户指令，为小说《${currentNovel.name}》续写下一章。
      风格: ${currentNovel.style}, 类型: ${currentNovel.genre}。
      确保内容与下面的相关信息、人物设定和剧情大纲保持一致性和连贯性。

      ---
      [剧情大纲]
      ${plotOutline}
      ---
      [核心人物]
      ${allCharactersInfo}
      ---
      [已知情节线索]
      ${allPlotCluesInfo || '暂无，这是故事的开端。'}
      ---
      [相关信息]
      ${contextText}
      ---
      [用户指令]
      ${finalUserPrompt}
      ---
      
      请在第一行提供本章的标题，然后换行，接着撰写新章节的正文内容。不要在标题前添加"标题："或"第X章"等前缀。
    `;

    try {
      // 4. RAG - 生成
      const response = await openai.chat.completions.create({
        model: activeConfig.model,
        messages: [{ role: 'user', content: finalPrompt }],
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
      });

      console.log("OpenAI response:", response);

      const newChapterContent = response.choices[0].message.content;
      if (!newChapterContent) {
        throw new Error("API did not return any content.");
      }
      
      set({ generatedContent: newChapterContent, generationLoading: false });

    } catch (error: any) {
      console.error("Failed to generate new chapter with OpenAI:", error);
      alert(`生成失败: ${error.message}`);
      set({ generationLoading: false });
    }
  },
  saveGeneratedChapter: async (novelId) => {
    const { generatedContent, chapters, currentNovel } = get();
    if (!generatedContent || !currentNovel) return;

    // --- Step 0: Parse Title and Content ---
    let title = `第 ${(chapters[chapters.length - 1]?.chapterNumber || 0) + 1} 章`;
    let content = generatedContent;
    const firstNewlineIndex = generatedContent.indexOf('\n');

    if (firstNewlineIndex !== -1) {
      const potentialTitle = generatedContent.substring(0, firstNewlineIndex).trim();
      // To avoid using a very long sentence as title if AI fails to follow instruction
      if (potentialTitle.length > 0 && potentialTitle.length < 50) {
        title = potentialTitle;
        content = generatedContent.substring(firstNewlineIndex + 1).trim();
      }
    }

    // --- Step 1: Analyze content to generate plot clues ---
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

            const cluePrompt = `
                你是一位目光敏锐的文学分析师。请仔细阅读以下小说章节内容，并提取3到5个最关键的情节线索、角色发展或重要事件。
                请以一个JSON数组的形式返回你的分析结果，数组中的每个对象都应包含 "title" (简短标题) 和 "description" (详细描述) 两个字段。
                
                章节内容:
                """
                ${content.substring(0, 4000)}
                """

                请直接返回JSON数组，不要包含任何额外的解释或Markdown标记。
            `;
            
            const clueResponse = await openai.chat.completions.create({
                model: activeConfig.model,
                messages: [{ role: 'user', content: cluePrompt }],
                response_format: { type: "json_object" },
                temperature: 0.5,
            });

            const responseContent = clueResponse.choices[0].message.content;
            if (responseContent) {
                // The AI might wrap the array in an object like { "clues": [...] }
                const parsedJson = JSON.parse(responseContent);
                const cluesArray = Array.isArray(parsedJson) ? parsedJson : (parsedJson.clues || []);
                
                newClues = cluesArray.map((clue: any) => ({
                    novelId,
                    title: clue.title || '无标题线索',
                    description: clue.description || '无描述',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }));
                
                if (newClues.length > 0) {
                    await db.plotClues.bulkAdd(newClues as PlotClue[]);
                }
            }
        }
    } catch (error) {
        console.error("Failed to generate plot clues:", error);
        // Do not block chapter saving if clue generation fails
    }

    // --- Step 2: Save the new chapter ---
    const newChapterNumber = (chapters[chapters.length - 1]?.chapterNumber || 0) + 1;

    const newChapter: Omit<Chapter, 'id'> = {
      novelId,
      chapterNumber: newChapterNumber,
      title: title, // Use parsed title
      content: content, // Use parsed content
      summary: content.substring(0, 200), // Auto-generate summary from content
      status: 'draft',
      wordCount: content.length, // Calculate word count from content
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.chapters.add(newChapter as Chapter);

    // --- Step 3: Update novel statistics ---
    await db.novels.update(novelId, {
      chapterCount: currentNovel.chapterCount + 1,
      wordCount: currentNovel.wordCount + content.length,
      expansionCount: currentNovel.expansionCount + 1,
      plotClueCount: (currentNovel.plotClueCount || 0) + newClues.length,
      updatedAt: new Date(),
    });

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
    set((state) => ({
      novels: state.novels.filter((novel) => novel.id !== id),
    }));
  },
})); 