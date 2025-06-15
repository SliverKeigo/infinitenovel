/**
 * 章节管理和处理工具
 */
import { toast } from "sonner";
import OpenAI from 'openai';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';
import { useAIConfigStore } from '@/store/ai-config';
import { parseJsonFromAiResponse } from './parsers';
import type { AIConfig } from "@/types/ai-config";

/**
 * 保存生成的章节并分析新角色和线索
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 * @param novelId - 小说ID
 */
export const saveGeneratedChapter = async (
  get: () => any,
  set: (partial: any) => void,
  novelId: number
) => {
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

  // Chapter object to be sent to the API
  const newChapterNumber = (chapters[chapters.length - 1]?.chapterNumber || 0) + 1;
  const newChapterData: Omit<Chapter, 'id' | 'createdAt' | 'updatedAt'> = {
    novel_id: novelId,
    chapter_number: newChapterNumber,
    title: title,
    content: content,
    summary: '', // Summary is generated on backend
    status: 'draft',
    word_count: content.length,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // --- Step 2: Post-generation Analysis for new characters and plot clues ---
  let newCharactersForApi: Omit<Character, "id">[] = [];
  let newCluesForApi: Omit<PlotClue, "id">[] = [];

  try {
    const { configs, activeConfigId } = useAIConfigStore.getState();
    const activeConfig = configs.find((c: AIConfig) => c.id === activeConfigId);

    const currentTask = get().generationTask;
    if (currentTask.isActive) {
      set({ generationTask: { ...currentTask, currentStep: '正在分析新角色与线索...' } });
    }

    if (activeConfig && activeConfig.api_key) {
      const openai = new OpenAI({
        apiKey: activeConfig.api_key,
        baseURL: activeConfig.api_base_url || undefined,
        dangerouslyAllowBrowser: true,
      });

      const analysisPrompt = `
            你是一位目光如炬的文学分析师和图书管理员。

            已知信息:
            1. 小说名: 《${currentNovel.name}》
            2. 当前已知的角色列表: [${characters.map((c: Character) => `"${c.name}"`).join(', ')}]
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

        if (Array.isArray(extractedCharacters) && extractedCharacters.length > 0) {
          toast.success(`发现了 ${extractedCharacters.length} 位新角色！`);
          newCharactersForApi = extractedCharacters.map((char: any) => ({
            novel_id: novelId,
            name: char.name || '未知姓名',
            core_setting: char.core_setting || '无设定',
            personality: '',
            background_story: char.initial_relationship ? `初次登场关系：${char.initial_relationship}` : '',
            appearance: '',
            relationships: '',
            description: char.description || '无描述',
            background: char.background || '无背景',
            status: 'active',
            created_at: new Date(), // Add dummy date to satisfy type
            updated_at: new Date(), // Add dummy date to satisfy type
          }));
        }

        if (Array.isArray(extractedClues) && extractedClues.length > 0) {
          toast.success(`发现了 ${extractedClues.length} 条新线索！`);
          newCluesForApi = extractedClues.map((clue: any) => ({
            novel_id: novelId,
            title: clue.title || '无标题线索',
            description: clue.description || '无描述',
            created_at: new Date(), // Add dummy date to satisfy type
            updated_at: new Date(), // Add dummy date to satisfy type
          }));
        }
      }
    }
  } catch (error) {
    console.error("后处理分析失败：", error);
    toast.error("分析新章节时出错，但章节数据仍会尝试保存。");
  }

  try {
    // --- Step 1 & 2 Combined: Save chapter, new characters, and clues via API ---
    const response = await fetch('/api/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            chapter: newChapterData, 
            newCharacters: newCharactersForApi,
            newPlotClues: newCluesForApi,
        }),
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }

    const { savedChapter, savedCharacters, savedPlotClues } = await response.json();

    // --- Step 3: Optimistic state update ---
    set((state: any) => ({
        chapters: [...state.chapters, savedChapter],
        characters: [...state.characters, ...savedCharacters],
        plotClues: [...state.plotClues, ...savedPlotClues],
        generatedContent: null, // Clear saved content
    }));

    // --- Step 4: Final novel stats update in DB ---
    await get().updateNovelStats(novelId);
    
    // --- Step 5: Update vector index to include the new chapter ---
    console.log(`[向量索引] 正在为新增章节更新向量索引...`);
    await get().buildNovelIndex(novelId);

  } catch (error) {
      console.error("Failed to save chapter via API:", error);
      toast.error("保存章节失败，请检查网络连接或查看控制台。");
  }
}; 