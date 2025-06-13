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
import { APIError } from 'openai/error';

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
  // 增强版正则表达式，匹配多种可能的章节标记格式
  // 包括: "第X章:", "第 X 章:", "第X.章:", "第 X. 章:" 等变体
  const regex = new RegExp(`第\\s*${chapterNumber}\\s*\\.?\\s*章:?([\\s\\S]*?)(?=\\n*第\\s*\\d+\\s*\\.?\\s*章:|$)`, 'i');
  
  console.log(`[诊断] 尝试从大纲中匹配第 ${chapterNumber} 章内容`);
  
  // 为了帮助诊断，记录大纲的前200个字符
  console.log(`[诊断] 大纲前200字符: ${outline.substring(0, 200)}...`);
  
  const match = outline.match(regex);
  
  if (match && match[1]) {
    console.log(`[诊断] 成功匹配到第 ${chapterNumber} 章内容，前50字符: ${match[1].trim().substring(0, 50)}...`);
    return match[1].trim();
  } else {
    console.log(`[诊断] 未能匹配到第 ${chapterNumber} 章内容`);
    
    // 尝试查找所有章节标记，帮助诊断
    const allChaptersRegex = /第\s*\d+\s*\.?\s*章:?/gi;
    const allChapters = outline.match(allChaptersRegex);
    if (allChapters) {
      console.log(`[诊断] 在大纲中找到的所有章节标记: ${JSON.stringify(allChapters.slice(0, 10))}`);
    } else {
      console.log(`[诊断] 在大纲中未找到任何章节标记`);
    }
    
    return null;
  }
};

/**
 * 从AI返回的可能包含Markdown代码块的字符串中安全地解析JSON。
 * @param content - AI返回的原始字符串
 * @returns 解析后的JavaScript对象
 * @throws 如果找不到或无法解析JSON，则抛出错误
 */
const parseJsonFromAiResponse = (content: string): any => {
  try {
    return JSON.parse(content);
  } catch (e) {
    console.warn("Direct JSON parsing failed, attempting fallback.", e);
  }

  try {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```|(\{[\s\S]*\})/);
    let jsonString = match ? (match[1] || match[2]) : content;

    jsonString = jsonString.replace(/[""]['']/g, '"');

    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Fallback JSON parsing also failed. Original content:", content);
    throw new Error(`AI返回了无效的JSON格式，即使在清理和提取后也无法解析。`);
  }
};

/**
 * 根据小说类型生成相应的风格指导
 * @param genre - 小说类型
 * @param style - 写作风格（可选）
 * @returns 针对该类型的风格指导字符串
 */
const getGenreStyleGuide = (genre: string, style?: string): string => {
  // 将类型和风格转换为小写以便匹配
  const genreLower = genre.toLowerCase();
  const styleLower = style?.toLowerCase() || '';

  // 创建一个风格指导数组，用于收集所有匹配的风格指导
  const styleGuides: string[] = [];

  // 轻小说/幽默/搞笑类
  if (genreLower.includes('轻小说') || genreLower.includes('幽默') ||
    genreLower.includes('搞笑') || genreLower.includes('喜剧') ||
    styleLower.includes('轻松') || styleLower.includes('幽默')) {
    styleGuides.push(`
【轻小说/幽默风格指南】
1. 每个场景都应该包含至少一个幽默元素、梗或出人意料的转折
2. 角色对话要机智、诙谐，可以适度夸张
3. 可以巧妙地打破第四面墙或引用流行文化
4. 角色之间的互动要有趣，可以设计"笑果"
5. 不要害怕使用夸张的表现手法和戏剧性的对比
6. 可以加入轻松的吐槽、自嘲或调侃元素
7. 角色可以有些"萌点"或特定的口头禅
`);
  }

  // 悬疑/推理类
  if (genreLower.includes('悬疑') || genreLower.includes('推理') ||
    genreLower.includes('侦探') || genreLower.includes('谜题') ||
    styleLower.includes('悬疑') || styleLower.includes('推理')) {
    styleGuides.push(`
【悬疑/推理风格指南】
1. 线索铺设要合理且有逻辑性，避免"天降神迹"式的解决方案
2. 保持适当的悬念和紧张感，但不要过度拖延关键信息
3. 角色的行动和动机要符合逻辑，即使是误导读者的线索也要有合理性
4. 适当使用有限视角或不可靠叙述者技巧
5. 构建谜题时要"公平"，读者应该有机会在故事中找到解谜的关键
6. 解谜过程要有层次感，可以设置多重谜题
7. 人物心理描写要细腻，尤其是面对压力和危机时的反应
`);
  }

  // 玄幻/仙侠/奇幻类
  if (genreLower.includes('玄幻') || genreLower.includes('仙侠') ||
    genreLower.includes('奇幻') || genreLower.includes('修仙') ||
    genreLower.includes('异世界') || genreLower.includes('魔法')) {
    styleGuides.push(`
【玄幻/仙侠/奇幻风格指南】
1. 世界观设定要有内在一致性，魔法/功法系统要有规则和限制
2. 战斗/修炼场景要有张力和视觉冲击力，可以适度夸张但不失逻辑
3. 角色成长要有阶段性和挑战性，避免毫无理由的突然强大
4. 神通/法术的使用要有创意，不只是简单的力量对抗
5. 可以融入东方/西方神话元素，但要有新的诠释
6. 描绘异世界时注重感官细节，让读者能够身临其境
7. 设置合理的权力结构和社会体系，增强世界的真实感
`);
  }

  // 都市/职场类
  if (genreLower.includes('都市') || genreLower.includes('职场') ||
    genreLower.includes('商战') || genreLower.includes('现代') ||
    styleLower.includes('现实') || styleLower.includes('职场')) {
    styleGuides.push(`
【都市/职场风格指南】
1. 人际关系和职场政治要真实，避免过于简单化的敌友关系
2. 冲突要基于现实中可能发生的情况，即使有夸张也要有现实基础
3. 角色的职业技能和专业知识要有可信度
4. 可以融入当代社会热点和现象，增强时代感
5. 描写生活细节时要精准，展现都市生活的多样性
6. 角色面临的挑战应该平衡个人能力和外部环境因素
7. 成功不应该来得过于容易，要展现努力、智慧和机遇的结合
`);
  }

  // 科幻类
  if (genreLower.includes('科幻') || genreLower.includes('未来') ||
    genreLower.includes('太空') || genreLower.includes('科技') ||
    styleLower.includes('科幻') || styleLower.includes('未来主义')) {
    styleGuides.push(`
【科幻风格指南】
1. 科技设定要有一定的科学基础或合理的外推，避免"黑科技"无限万能
2. 未来社会的描绘要考虑技术对人类行为、社会结构的影响
3. 可以探讨科技伦理、人性、存在主义等深层次主题
4. 世界构建要注重细节，包括科技如何改变日常生活的方方面面
5. 科幻元素应该服务于故事和角色，而不仅仅是摆设
6. 可以设置"认知震撼"的场景，挑战读者的想象力
7. 在描述高科技设备和现象时，平衡技术细节和可读性
`);
  }

  // 言情/恋爱类
  if (genreLower.includes('言情') || genreLower.includes('恋爱') ||
    genreLower.includes('爱情') || genreLower.includes('romance') ||
    styleLower.includes('浪漫') || styleLower.includes('感性')) {
    styleGuides.push(`
【言情/恋爱风格指南】
1. 角色之间的情感发展要有层次和进程，避免毫无铺垫的感情爆发
2. 情感冲突要有深度，可以探索价值观差异、成长经历等深层原因
3. 对话和互动要有情感张力和微妙变化
4. 适当使用环境和气氛烘托情感发展
5. 角色的内心独白可以更细腻地展现情感变化
6. 感情线索可以与其他故事线索交织，增加复杂性
7. 浪漫场景要有创意，避免落入俗套
`);
  }

  // 历史/架空历史类
  if (genreLower.includes('历史') || genreLower.includes('古代') ||
    genreLower.includes('王朝') || genreLower.includes('架空') ||
    styleLower.includes('古风') || styleLower.includes('历史')) {
    styleGuides.push(`
【历史/架空历史风格指南】
1. 历史背景要有一定的准确性，即使是架空也要有内在逻辑
2. 人物的言行要符合时代背景，避免现代思维过度入侵
3. 可以巧妙融入历史事件或人物，但要有新的角度
4. 描写历史场景时注重细节，包括服饰、建筑、礼仪等
5. 政治、军事、文化等元素要有深度，展现时代特色
6. 在架空历史中，可以大胆想象，但变化要有合理性
7. 可以通过小人物视角反映大时代变迁
`);
  }

  // 游戏/竞技类
  if (genreLower.includes('游戏') || genreLower.includes('竞技') ||
    genreLower.includes('体育') || genreLower.includes('电竞') ||
    styleLower.includes('热血') || styleLower.includes('竞技')) {
    styleGuides.push(`
【游戏/竞技风格指南】
1. 比赛/对战场景要有张力和节奏感，可以使用专业术语增强真实感
2. 角色的成长要体现技术进步和心理成熟
3. 团队协作中展现不同角色的特点和价值
4. 对手不应该是单一维度的反派，可以有自己的故事和动机
5. 技战术分析要有深度，展现策略思考的过程
6. 可以融入行业内幕或专业知识，增强专业感
7. 挫折和失败是成长的必要部分，不要让主角总是轻易获胜
`);
  }

  // 默认风格指导（如果没有匹配到任何类型）
  if (styleGuides.length === 0) {
    styleGuides.push(`
【通用风格指南】
1. 保持情节的连贯性和角色的一致性
2. 场景描写要有代入感，让读者能够身临其境
3. 对话要自然流畅，符合角色特点
4. 冲突和转折要有意外性，但不失合理性
5. 节奏要有变化，紧张与舒缓相结合
6. 角色情感要有真实感，避免过于扁平化
7. 适当设置悬念和铺垫，保持读者的阅读兴趣
`);
  }

  // 将所有匹配的风格指导合并
  return styleGuides.join('\n');
};

/**
 * 处理OpenAI API调用中的特定错误，特别是配置错误。
 * @param error - 捕获到的错误对象
 * @throws 如果是可识别的配置错误，则抛出新的、更清晰的错误；否则重新抛出原始错误。
 */
const handleOpenAIError = (error: any) => {
  if (error instanceof APIError) {
    const responseBody = error.error;
    // 有时代理或错误的URL会返回一个HTML页面，而不是一个API错误
    if (typeof responseBody === 'string' && responseBody.includes('You need to enable JavaScript to run this app')) {
      throw new Error("API请求失败：配置的URL可能是一个Web页面而不是API端点，请检查您的AI配置。");
    }
  }
  // 对于所有其他错误，按原样抛出
  throw error;
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
  generateChapters: (
    novelId: number,
    context: {
      plotOutline: string;
      characters: Character[];
      settings: GenerationSettings;
    },
    options: {
      chaptersToGenerate: number;
      userPrompt?: string;
    }
  ) => Promise<void>;
  generateNewChapter: (
    novelId: number,
    context: {
      plotOutline: string;
      characters: Character[];
      settings: GenerationSettings;
    },
    userPrompt: string | undefined,
    chapterToGenerate: number,
  ) => Promise<void>;
  generateNovelChapters: (novelId: number, goal: number, initialChapterGoal?: number) => Promise<void>;
  saveGeneratedChapter: (novelId: number) => Promise<void>;
  addNovel: (novel: Omit<Novel, 'id' | 'createdAt' | 'updatedAt' | 'wordCount' | 'chapterCount' | 'characterCount' | 'expansionCount' | 'plotOutline' | 'plotClueCount'>) => Promise<number | undefined>;
  deleteNovel: (id: number) => Promise<void>;
  updateNovelStats: (novelId: number) => Promise<void>;
  recordExpansion: (novelId: number) => Promise<void>;
  expandPlotOutlineIfNeeded: (novelId: number, force?: boolean) => Promise<void>;
  forceExpandOutline: (novelId: number) => Promise<void>;
  resetGenerationTask: () => void;
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
  resetGenerationTask: () => {
    set({
      generationTask: {
        isActive: false,
        progress: 0,
        currentStep: '空闲',
        novelId: null,
      },
      generationLoading: false,
    });
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
  generateChapters: async (novelId, _context, { chaptersToGenerate, userPrompt }) => {
    set({
      generationTask: {
        isActive: true,
        progress: 0,
        currentStep: `准备生成 ${chaptersToGenerate} 个新章节...`,
        novelId,
      },
      generationLoading: true,
      generatedContent: null, // Reset content view
    });

    try {
      for (let i = 0; i < chaptersToGenerate; i++) {
        const progress = (i / chaptersToGenerate) * 100;
        // The number of the chapter we are about to generate
        const nextChapterNumber = (get().chapters.length || 0) + 1;

        set(state => ({
          generationTask: {
            ...state.generationTask,
            progress: Math.floor(progress),
            currentStep: `(第 ${i + 1}/${chaptersToGenerate} 章) 正在生成第 ${nextChapterNumber} 章...`
          }
        }));

        // Only use the user prompt for the very first chapter of this batch
        const promptForThisChapter = i === 0 ? userPrompt : undefined;

        // Step 1: Check and expand plot outline if needed.
        await get().expandPlotOutlineIfNeeded(novelId);

        // Step 2: Refetch the latest context, as outline might have changed.
        const currentNovel = get().currentNovel;
        const characters = get().characters;
        const settings = await useGenerationSettingsStore.getState().getSettings();

        if (!currentNovel || !currentNovel.plotOutline || !settings) {
          throw new Error("续写失败：无法获取必要的小说信息或设置。");
        }

        const currentContext = {
          plotOutline: currentNovel.plotOutline,
          characters: characters,
          settings: settings,
        };

        // Step 3: Generate the new chapter content.
        await get().generateNewChapter(novelId, currentContext, promptForThisChapter, nextChapterNumber);

        // Step 4: Save the generated chapter.
        if (get().generatedContent) {
          await get().saveGeneratedChapter(novelId);
        } else {
          toast.warning(`第 ${nextChapterNumber} 章内容生成为空，续写任务已中止。`);
          break;
        }
      }

      if (get().generationTask.isActive) { // Check if it wasn't aborted
        await get().recordExpansion(novelId); // Record one expansion for the whole batch.
        toast.success(`${chaptersToGenerate > 1 ? `全部 ${chaptersToGenerate} 个` : ''}新章节已生成完毕！`);
        set(state => ({
          generationTask: {
            ...state.generationTask,
            isActive: false,
            progress: 100,
            currentStep: '续写任务完成！'
          }
        }));
      }

    } catch (error) {
      console.error("An error occurred during the chapter generation process:", error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      toast.error(`续写章节时发生错误: ${errorMessage}`);
      set(state => ({
        generationTask: {
          ...state.generationTask,
          isActive: false,
          currentStep: `续写失败: ${errorMessage}`,
        },
      }));
    } finally {
      set({ generationLoading: false });
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
        你是一位经验丰富的小说编辑和世界构建大师。请为一部名为《${novel.name}》的小说创作一个结构化、分阶段的故事大纲。

        **核心信息:**
        - 小说类型: ${novel.genre}
        - 写作风格: ${novel.style}
        - 计划总章节数: ${goal}
        - 核心设定与特殊要求: ${novel.specialRequirements || '无'}

        ${outlineStyleGuide}

        **你的任务分为两部分：**

        **Part 1: 开篇详细剧情 (Chapter-by-Chapter)**
        请为故事最开始的 ${initialChapterGoal} 章提供逐章的、较为详细的剧情摘要。
        - **最高优先级指令:** 你的首要任务是仔细阅读上面的"核心设定与特殊要求"。如果其中描述了故事的开篇情节（如主角的来历、穿越过程等），那么你生成的"第1章"大纲必须严格按照这个情节来写。
        - **叙事节奏指南:** 请放慢叙事节奏。每个章节的摘要只应包含一个核心的小事件或2-3个关键场景，而不是一个完整的情节弧线。学会将一个大事件拆分成多个章节来铺垫和展开。
        - **格式要求:** 必须严格使用"第X章: [剧情摘要]"的格式，不要添加额外的符号（如点号）。例如，应该是"第3章: 标题"而不是"第3.章: 标题"。

        **Part 2: 后续宏观规划 (Phased Outline)**
        在完成开篇的详细剧情后，请根据你对小说类型（${novel.genre}）的理解，为剩余的章节设计一个更高层次的、分阶段的宏观叙事结构。
        - 你需要将故事划分为几个大的部分或"幕"（例如：第一幕：起源与探索，第二幕：冲突升级，第三幕：决战与尾声）。
        - 在每个部分下，简要描述这一阶段的核心目标、关键转折点和大致的剧情走向。
        - **这部分不需要逐章展开**，而是提供一个清晰的、指导未来创作方向的路线图。

        **请特别注意：**
        1. 整个大纲必须遵循上述风格指南，确保风格一致性
        2. 每个章节都应该有明确的目标和冲突
        3. 故事应该有清晰的发展脉络和节奏变化
        4. 角色成长和情节发展要相互促进
        5. 章节标记必须使用统一的格式："第X章: "，不要使用"第X.章: "或其他变体

        **输出格式要求:**
        请严格按照以下格式输出，先是详细章节，然后是宏观规划。
        
        第1章: [剧情摘要]
        第2章: [剧情摘要]
        ...
        第${initialChapterGoal}章: [剧情摘要]

        ---
        **宏观叙事规划**
        ---
        **第一幕: [幕标题] (大约章节范围)**
        - [本幕核心剧情概述]
        
        **第二幕: [幕标题] (大约章节范围)**
        - [本幕核心剧情概述]

        ...

        **重要提醒:** 你的唯一任务是生成大纲。绝对禁止返回任何形式的小说简介或摘要。
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

      // --- STAGE 2: CREATE CHARACTERS ---3
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
你是一位顶级小说编剧，任务是规划即将开始的新章节，确保故事天衣无缝。

${userRequirementsContext}
${mandatoryRules}
${styleGuide}

**最高优先级指令：** 你的首要任务是延续上一章的结尾。所有你规划的场景都必须直接从这一点开始。绝对禁止出现情节断裂。

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
2.  设计出 ${actualSegmentsPerChapter} 个连贯的场景。你设计的第一个场景必须紧接着"上一章结尾"发生。如果"参考剧情大纲"与结尾情节有冲突，你必须巧妙地调整或重新安排大纲中的事件，使其能够自然地融入到故事流中，而不是生硬地插入。

请严格按照以下JSON格式返回，不要包含任何额外的解释或Markdown标记：
**JSON格式化黄金法则：如果任何字段的字符串值内部需要包含双引号(")，你必须使用反斜杠进行转义(\\")，否则会导致解析失败。**
{
  "title": "章节标题",
  "scenes": [
    "场景1的简要描述 (必须紧接上一章结尾)",
    "场景2的简要描述",
    "..."
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

      const targetTotalWords = 3000;
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
    const newChapterId = await db.chapters.add(newChapter as Chapter);
    const savedChapter = { ...newChapter, id: newChapterId };

    // --- Step 2: Post-generation Analysis for new characters and plot clues ---
    let charactersWithIds: Character[] = [];
    let cluesWithIds: PlotClue[] = [];

    try {
      let newCharacters: Omit<Character, "id">[] = [];
      let newClues: Omit<PlotClue, "id">[] = [];

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
              **JSON格式化黄金法则：如果任何字段的字符串值内部需要包含双引号(")，你必须使用反斜杠进行转义(\\")，否则会导致解析失败。**
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
            const addedCharIds = await db.characters.bulkAdd(newCharacters as Character[], { allKeys: true });
            charactersWithIds = newCharacters.map((char, index) => ({
              ...char,
              id: addedCharIds[index],
            })) as Character[];
          }
          if (newClues.length > 0) {
            toast.success(`发现了 ${newClues.length} 条新线索！`);
            const addedClueIds = await db.plotClues.bulkAdd(newClues as PlotClue[], { allKeys: true });
            cluesWithIds = newClues.map((clue, index) => ({
              ...clue,
              id: addedClueIds[index],
            })) as PlotClue[];
          }
        }
      }
    } catch (error) {
      console.error("后处理分析失败：", error);
      toast.error("分析新章节时出错，但章节已保存。");
    }

    // --- Step 3: Optimistic state update ---
    set(state => ({
      chapters: [...state.chapters, savedChapter],
      characters: [...state.characters, ...charactersWithIds],
      plotClues: [...state.plotClues, ...cluesWithIds],
      generatedContent: null, // 清理已保存的内容
    }));

    // --- Step 4: Final novel stats update in DB ---
    await get().updateNovelStats(novelId);
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
  updateNovelStats: async (novelId: number) => {
    const novel = await db.novels.get(novelId);
    if (!novel) return;

    const chapters = await db.chapters.where('novelId').equals(novelId).toArray();
    const characters = await db.characters.where('novelId').equals(novelId).toArray();
    const plotClues = await db.plotClues.where('novelId').equals(novelId).toArray();

    const totalWordCount = chapters.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0);

    await db.novels.update(novelId, {
      chapterCount: chapters.length,
      characterCount: characters.length,
      plotClueCount: plotClues.length,
      wordCount: totalWordCount,
      updatedAt: new Date(),
    });

    // After updating the source of truth, refresh the state
    await get().fetchNovelDetails(novelId);
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
  expandPlotOutlineIfNeeded: async (novelId: number, force = false) => {
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

    if (force || detailedChaptersInOutline - currentChapterCount < OUTLINE_EXPAND_THRESHOLD) {
      toast.info("AI正在思考后续情节，请稍候...");
      console.log("触发大纲扩展...");

      const openai = new OpenAI({
        apiKey: activeConfig.apiKey,
        baseURL: activeConfig.apiBaseUrl || undefined,
        dangerouslyAllowBrowser: true,
      });

      // 获取基于小说类型的风格指导
      const styleGuide = getGenreStyleGuide(novel.genre, novel.style);

      const expansionPrompt = `
          你是一位正在续写自己史诗级作品《${novel.name}》的小说家。
          
          ${styleGuide}
          
          这是我们共同确定的、贯穿整个故事的宏观篇章规划和已有的详细大纲：
          ---
          ${novel.plotOutline}
          ---
          任务: 
          我们已经完成了前 ${currentChapterCount} 章的创作。现在，请你基于已有的宏观规划和剧情，为故事紧接着生成从第 ${detailedChaptersInOutline + 1} 章到第 ${detailedChaptersInOutline + OUTLINE_EXPAND_CHUNK_SIZE} 章的详细剧情摘要。
          
          请确保新的细纲与前面的剧情无缝衔接，并稳步推进核心情节。
          请只返回新增的这 ${OUTLINE_EXPAND_CHUNK_SIZE} 章细纲，格式为"第X章: [剧情摘要]"，不要重复任何已有内容或添加额外解释。
          
          请特别注意：
          1. 每个章节的剧情摘要应该遵循上面的风格指南，确保风格一致性
          2. 避免剧情过于平淡或重复，每个章节都应该有新的发展或转折
          3. 角色行为要符合其已建立的性格特点
          4. 确保新增章节与整体故事弧线保持一致
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
  forceExpandOutline: async (novelId: number) => {
    set({ generationLoading: true });
    toast.info("正在强制扩展大纲...");
    try {
      await get().expandPlotOutlineIfNeeded(novelId, true);
    } catch (error) {
      console.error("强制扩展大纲失败:", error);
      toast.error(`强制扩展大纲时出错: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      set({ generationLoading: false });
    }
  },
}));