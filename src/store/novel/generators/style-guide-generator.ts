/**
 * 风格指导生成器
 * 使用AI为小说生成定制化的风格指导
 */
import { useAIConfigStore } from '@/store/ai-config';
import OpenAI from 'openai';
import { db } from '@/lib/db';

/**
 * 为小说生成定制化的风格指导
 * @param novelId - 小说ID
 * @returns 生成的风格指导字符串
 */
export const generateCustomStyleGuide = async (novelId: number): Promise<string> => {
  try {
    // 获取小说信息
    const novel = await db.novels.get(novelId);
    if (!novel) {
      throw new Error("小说信息未找到");
    }

    // 获取AI配置
    const { activeConfigId } = useAIConfigStore.getState();
    if (!activeConfigId) {
      throw new Error("没有激活的AI配置");
    }
    const activeConfig = await db.aiConfigs.get(activeConfigId);
    if (!activeConfig || !activeConfig.apiKey) {
      throw new Error("有效的AI配置未找到或API密钥缺失");
    }

    console.log(`[风格指导] 正在为小说《${novel.name}》生成定制风格指导`);

    // 创建OpenAI客户端实例
    const openai = new OpenAI({
      apiKey: activeConfig.apiKey,
      baseURL: activeConfig.apiBaseUrl,
      dangerouslyAllowBrowser: true,
    });

    // 构建提示词
    const prompt = `
你是一位专业的小说编辑和文学顾问，精通各种文学风格和类型。请为以下小说创建一个全面、详细的风格指导，该指导将用于AI生成小说内容时保持一致的风格和语调。

**小说基本信息:**
- 标题: 《${novel.name}》
- 类型: ${novel.genre}
- 写作风格: ${novel.style}
- 特殊要求: ${novel.specialRequirements || '无'}

**你的任务:**
创建一个详细的风格指导，包含7-10条具体指导原则，确保AI能够准确把握这部小说的风格特点。

请特别注意:
1. 这部小说包含多种风格元素 (${novel.genre})，你需要创建一个能够协调融合这些元素的指导，而不是简单地将不同风格的指导拼接在一起。
2. 指导原则应该具体、可操作，而不是笼统的建议。
3. 考虑小说类型和风格的独特组合，提供针对性的写作技巧和风格特点。
4. 包括叙事视角、语言风格、情节节奏、场景描写、对话特点等方面的具体指导。
5. 如果小说类型中包含特定领域知识（如科幻、历史、医疗等），请提供相关内容的处理建议。

请直接以【风格指导】开头，然后列出具体的指导原则，不要包含任何前缀说明或额外解释。
`;

    // 调用AI生成风格指导
    const response = await openai.chat.completions.create({
      model: activeConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    const styleGuide = response.choices[0].message.content || "";

    // 保存生成的风格指导到小说数据中
    await db.novels.update(novelId, { styleGuide });

    console.log(`[风格指导] 风格指导生成成功，长度: ${styleGuide.length}`);
    return styleGuide;
  } catch (error) {
    console.error("[风格指导] 生成风格指导失败:", error);
    throw error;
  }
};

/**
 * 获取小说的风格指导
 * 如果小说已有保存的风格指导，则直接返回；否则生成新的风格指导
 * @param novelId - 小说ID
 * @returns 风格指导字符串
 */
export const getOrCreateStyleGuide = async (novelId: number): Promise<string> => {
  // 获取小说信息
  const novel = await db.novels.get(novelId);
  if (!novel) {
    throw new Error("小说信息未找到");
  }

  // 如果已有保存的风格指导且不为空，则直接返回
  if (novel.styleGuide && novel.styleGuide.trim().length > 0) {
    return novel.styleGuide;
  }

  // 否则生成新的风格指导
  return await generateCustomStyleGuide(novelId);
}; 