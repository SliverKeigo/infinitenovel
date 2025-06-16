/**
 * 角色行为准则生成器
 * 使用AI为小说生成定制化的角色行为准则
 */
import { useAIConfigStore } from '@/store/ai-config';
import OpenAI from 'openai';
import { callOpenAIWithRetry } from '../utils/ai-utils';
import type { Novel } from '@/types/novel';
import type { AIConfig } from '@/types/ai-config';

/**
 * 为小说生成定制化的角色行为准则
 * @param novel - 小说对象
 * @param activeConfig - 激活的AI配置
 * @returns 生成的角色行为准则字符串
 */
export const generateCharacterRules = async (novel: Novel, activeConfig: AIConfig): Promise<string> => {
  try {
    if (!activeConfig.api_key) {
      throw new Error("有效的AI配置未找到或API密钥缺失");
    }

    console.log(`[角色准则] 正在为小说《${novel.name}》生成定制角色行为准则`);

    // 创建OpenAI客户端实例
    const openai = new OpenAI({
      apiKey: activeConfig.api_key,
      baseURL: activeConfig.api_base_url || undefined,
      dangerouslyAllowBrowser: true,
    });

    // 构建提示词
    const prompt = `
你是一位资深的世界观架构师和小说家，擅长设计严谨自洽的角色行为逻辑。请为以下小说创建一套关于"角色行为与互动"的核心准则，确保AI在生成故事时能够维持角色性格和世界观的一致性。

**小说基本信息:**
- 标题: 《${novel.name}》
- 类型: ${novel.genre}
- 写作风格: ${novel.style}
- 简介: ${novel.description || '无'}
- 特殊要求: ${novel.special_requirements || '无'}

**你的任务:**
创建一套包含5-8条核心原则的角色行为准则。这些准则应该能够指导AI在创作时，正确处理不同角色（或阵营、种族）的思维方式、对话风格和行为逻辑。

请特别注意:
1.  **区分信息差:** 如果存在特定信息（如主角知道自己有"系统"，而其他人不知道），请明确规定不同角色群体的信息认知边界。
2.  **阵营/文化行为:** 如果小说中存在不同阵营、国家或种族，请定义他们之间典型的互动模式和行为差异。
3.  **核心动机:** 明确主要角色或群体的核心驱动力是什么（例如：生存、荣誉、复仇、探索）。
4.  **对话风格:** 定义不同角色的语言特点。例如，某个角色说话总是很简洁，另一个角色则喜欢使用比喻。
5.  **禁忌与底线:** 设定角色或群体的行为禁忌。例如，"精灵族从不说谎"，"某个角色绝不伤害妇孺"。

准则应该具体、可操作，能直接用于指导AI写作。

请直接以【角色行为准则】开头，然后列出具体的指导原则，不要包含任何前缀说明或额外解释。
`;

    // 调用AI生成
    // const response = await callOpenAIWithRetry(() =>
    //   openai.chat.completions.create({
    //     model: activeConfig.model,
    //     messages: [{ role: 'user', content: prompt }],
    //     temperature: 0.7,
    //   })
    // );
    const apiResponse = await fetch('/api/ai/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeConfigId: activeConfig.id,
        model: activeConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`API request failed with status ${apiResponse.status}: ${errorText}`);
    }

    const response = await apiResponse.json();

    let rulesText = response.choices[0].message.content || "";
    
    // 清理AI可能返回的额外文本
    rulesText = rulesText.replace(/【角色行为准则】/g, '').trim();

    // 保存生成的准则到小说数据中
    await fetch(`/api/novels/${novel.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character_behavior_rules: rulesText })
    });

    console.log(`[角色准则] 角色行为准则生成成功，长度: ${rulesText.length}`);
    return rulesText;
  } catch (error) {
    console.error("[角色准则] 生成角色行为准则失败:", error);
    throw error;
  }
};

/**
 * 获取小说的角色行为准则
 * 如果小说已有保存的准则，则直接返回；否则生成新的准则
 * @param novelId - 小说ID
 * @returns 角色行为准则字符串
 */
export const getOrCreateCharacterRules = async (novelId: number): Promise<string> => {
  // 1. 获取小说信息
  const novelResponse = await fetch(`/api/novels/${novelId}`);
  if (!novelResponse.ok) throw new Error("获取小说信息失败");
  const novel = await novelResponse.json() as Novel;
  if (!novel) throw new Error("小说信息未找到");

  // 2. 如果已有保存的准则且不为空，则直接返回
  if (novel.character_behavior_rules && novel.character_behavior_rules.trim().length > 0) {
    console.log("[角色准则] 使用已保存的定制角色行为准则");
    return novel.character_behavior_rules;
  }

  // 3. 获取AI配置
  const { configs, activeConfigId } = useAIConfigStore.getState();
  if (!activeConfigId) throw new Error("没有激活的AI配置");
  const activeConfig = configs.find(c => c.id === activeConfigId);
  if (!activeConfig) throw new Error("有效的AI配置未找到");

  // 4. 否则生成新的准则
  return await generateCharacterRules(novel, activeConfig);
}; 