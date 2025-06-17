/**
 * 章节管理和处理工具
 */
import { toast } from "sonner";
import OpenAI from 'openai';
import type { Chapter } from '@/types/chapter';
import type { Character } from '@/types/character';
import type { PlotClue } from '@/types/plot-clue';
import { useAIConfigStore } from '@/store/ai-config';
import { parseJsonFromAiResponse } from '../parsers';
import type { AIConfig } from "@/types/ai-config";
import { extractTextFromAIResponse } from "./ai-utils";

/**
 * 获取小说当前的最大章节号
 * @param novelId - 小说ID
 * @returns 当前最大章节号
 */
export const getMaxChapterNumber = async (novelId: number): Promise<number> => {
  const response = await fetch(`/api/chapters?novel_id=${novelId}`);
  if (!response.ok) {
    throw new Error("获取章节信息失败");
  }
  const chapters = await response.json() as Chapter[];
  return Math.max(...chapters.map((c: { chapter_number: number }) => c.chapter_number), 0);
};

/**
 * 验证章节号是否可用
 * @param novelId - 小说ID
 * @param chapterNumber - 要验证的章节号
 * @returns 如果章节号已存在返回false，否则返回true
 */
export const isChapterNumberAvailable = async (novelId: number, chapterNumber: number): Promise<boolean> => {
  const response = await fetch(`/api/chapters?novel_id=${novelId}`);
  if (!response.ok) {
    throw new Error("验证章节号时获取章节信息失败");
  }
  const chapters = await response.json() as Chapter[];
  return !chapters.some((c: { chapter_number: number }) => c.chapter_number === chapterNumber);
};

/**
 * 保存生成的章节并分析新角色和线索
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 * @param novelId - 小说ID
 * @param expectedChapterNumber - 预期的章节号（可选，如果不提供则基于现有章节计算）
 */
export const saveGeneratedChapter = async (
  get: () => any,
  set: (partial: any) => void,
  novelId: number,
  expectedChapterNumber?: number
) => {
  const { generatedContent, chapters = [], currentNovel, characters } = get();
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
      title = `第 ${expectedChapterNumber || (chapters[chapters.length - 1]?.chapterNumber || 0) + 1} 章 (格式严重错误)`;
      content = generatedContent;
    }
  }

  if (!content) {
    toast.error("AI返回的内容为空，无法保存。");
    return;
  }

  // 获取或验证章节号
  let newChapterNumber = expectedChapterNumber;
  if (!newChapterNumber) {
    // 如果没有提供预期章节号，获取当前最大章节号并加1
    newChapterNumber = await getMaxChapterNumber(novelId) + 1;
  }

  // 验证章节号是否可用
  const isAvailable = await isChapterNumberAvailable(novelId, newChapterNumber);
  if (!isAvailable) {
    console.warn(`[章节保存] 检测到重复的章节号 ${newChapterNumber}，尝试获取新的章节号`);
    // 获取新的可用章节号
    newChapterNumber = await getMaxChapterNumber(novelId) + 1;
    // 再次验证新章节号
    const isNewNumberAvailable = await isChapterNumberAvailable(novelId, newChapterNumber);
    if (!isNewNumberAvailable) {
      throw new Error(`无法获取有效的章节号，请检查章节编号逻辑`);
    }
  }

  const newChapterData: Omit<Chapter, 'id' | 'createdAt' | 'updatedAt'> = {
    novel_id: novelId,
    chapter_number: newChapterNumber,
    title: title,
    content: content,
    summary: '', // Summary is generated on backend
    status: 'draft',
    is_published: false,
    word_count: content.length,
    created_at: new Date(),
    updated_at: new Date(),
  };

  let newCharactersForApi: any[] = [];
  let newCluesForApi: any[] = [];

  // 后处理分析，提取新角色、新线索等
  try {
    const { configs, activeConfigId } = useAIConfigStore.getState();
    const activeConfig = configs.find((c: AIConfig) => c.id === activeConfigId);
    if (!activeConfig) {
      throw new Error("没有检测到活动的AI配置。");
    }

      const analysisPrompt = `
你是一个小说分析引擎，你的任务是分析给定章节的内容，并以严格的JSON格式返回你的分析结果。

**章节内容:**
---
${content}
---

**分析指令:**
1.  **总结 (summary):** 为本章内容写一个简短的（不超过200字）摘要。
2.  **新角色 (newCharacters):** 识别本章中首次出现的、值得记录的角色。如果一个角色非常次要（如没有名字的路人），则不要包含。每个角色应包含 "name" 和 "description"。如果本章没有新角色，则返回一个空数组 []。
3.  **新线索 (newPlotClues):** 识别本章中出现的、可能对未来情节有影响的新线索或伏笔。每个线索应包含 "title" 和 "description"。如果本章没有新线索，则返回一个空数组 []。

**输出格式要求:**
- 必须是单个JSON对象。
- 不要包含任何解释、前缀或后缀。
- 不要使用Markdown代码块。
- 直接以 { 开始你的响应，以 } 结束。

**JSON结构示例:**
{
  "summary": "本章的简要总结...",
  "newCharacters": [
    { "name": "角色A", "description": "角色A的简要描述和背景。" },
    { "name": "角色B", "description": "角色B的简要描述和背景。" }
  ],
  "newPlotClues": [
    { "title": "线索1的标题", "description": "对这个新线索的详细描述。" },
    { "title": "线索2的标题", "description": "对这个新线索的详细描述。" }
  ]
}
          `;

    const aiApiResponse = await fetch('/api/ai/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeConfigId: activeConfig.id,
        model: activeConfig.model,
        messages: [{ role: 'user', content: analysisPrompt }],
        temperature: 0.3,
      }),
    });

    if (!aiApiResponse.ok) {
      const errorText = await aiApiResponse.text();
      throw new Error(`API request failed with status ${aiApiResponse.status}: ${errorText}`);
    }
    const analysisResponse = await aiApiResponse.json() as { choices: { message: { content: any } }[] };
    const analysisContent = extractTextFromAIResponse(analysisResponse);
    const analysisResult = parseJsonFromAiResponse(analysisContent);
    
    // 用AI分析的结果更新章节数据
    newChapterData.summary = analysisResult.summary || '';

    if (Array.isArray(analysisResult.newCharacters) && analysisResult.newCharacters.length > 0) {
      toast.success(`发现了 ${analysisResult.newCharacters.length} 位新角色！`);
      newCharactersForApi = analysisResult.newCharacters.map((char: any) => ({
        novel_id: novelId,
            name: char.name || '未知姓名',
        description: char.description || '无',
        is_protagonist: false,
          }));
        }

    if (Array.isArray(analysisResult.newPlotClues) && analysisResult.newPlotClues.length > 0) {
      toast.success(`发现了 ${analysisResult.newPlotClues.length} 条新线索！`);
      newCluesForApi = analysisResult.newPlotClues.map((clue: any) => ({
        novel_id: novelId,
            title: clue.title || '无标题线索',
        description: clue.description || '无',
        status: '未解开',
      }));
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
        const errorText = await response.text();
        throw new Error(`API Error: ${response.statusText} - ${errorText}`);
    }

    const responseData = await response.json() as { chapter: Chapter, savedCharacters: Character[], savedPlotClues: PlotClue[] };

    // 安全地解构和设置默认值
    const savedChapter = responseData.chapter;
    const savedCharacters = Array.isArray(responseData.savedCharacters) ? responseData.savedCharacters : [];
    const savedPlotClues = Array.isArray(responseData.savedPlotClues) ? responseData.savedPlotClues : [];

    if (!savedChapter) {
        throw new Error("API did not return a saved chapter.");
    }
    
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