/**
 * 风格指导生成器
 * 使用AI为小说生成定制化的风格指导
 */
import { useAIConfigStore } from '@/store/ai-config';
import OpenAI from 'openai';
import { callOpenAIWithRetry, extractTextFromAIResponse } from '../utils/ai-utils';
import { Novel } from '@/types/novel';

/**
 * 为小说生成定制化的风格指导
 * @param novelId - 小说ID
 * @returns 生成的风格指导字符串
 */
export const generateCustomStyleGuide = async (novelId: number): Promise<string> => {
  try {
    // 获取小说信息
    const novelResponse = await fetch(`/api/novels/${novelId}`, { cache: 'no-store' });
    if (!novelResponse.ok) {
      throw new Error("获取小说信息失败");
    }
    const novel = await novelResponse.json()   as Novel;
    if (!novel) {
      throw new Error("小说信息未找到");
    }

    // 获取AI配置
    const { configs, activeConfigId } = useAIConfigStore.getState();
    if (!activeConfigId) {
      throw new Error("没有激活的AI配置");
    }
    const activeConfig = configs.find(c => c.id === activeConfigId);
    if (!activeConfig || !activeConfig.api_key) {
      throw new Error("有效的AI配置未找到或API密钥缺失");
    }


    // 创建OpenAI客户端实例
    const openai = new OpenAI({
      apiKey: activeConfig.api_key,
      baseURL: activeConfig.api_base_url || undefined,
      dangerouslyAllowBrowser: true,
    });

    // 构建提示词
    const prompt = `
你是一位精通网络小说、传统文学、轻小说等多种风格的专业编辑。请根据下方小说信息，智能生成一份风格指导，要求如下：

**小说基本信息:**
- 标题: 《${novel.name}》
- 类型: ${novel.genre}
- 写作风格: ${novel.style}
- 特殊要求: ${novel.special_requirements || '无'}

1. 充分分析"类型"、"风格"、"特殊要求"字段，判断该小说是否属于网络小说、爽文、系统流、苟道流等网文主流类型。
2. 如果属于网文类型，请在风格指导中强化以下元素（仅适用时）：
   - 章节结尾有钩子或悬念，激发读者欲望
   - 语言网络化、代入感强、爽感突出，适当使用主角内心吐槽、网络流行语
   - 节奏明快，避免大段抒情和重复
   - 如为系统文/属性流，适当加入系统提示、属性面板、升级反馈等
   - 对话多，心理活动直接，主角有自嘲/吐槽/反转
   - 章节推进要有爽感，避免拖沓
3. 如果不是网文类型，则根据实际风格和特殊要求，给出最适合该小说的风格指导。
4. 风格指导要具体、可操作，涵盖叙事视角、语言风格、节奏、场景、对话、章节结尾等方面。
5. 不要死板套用模板，要根据用户输入灵活调整。

【输出格式要求】
- 优先输出结构化JSON数组，每条为一个风格指导原则，字段包括：id(唯一标识)、type(如scene_end/hook/爽点/scene_core/对话/节奏/视角/系统消息等)、description(具体可操作的指导)、trigger(适用类型，如network_novel/system_flow/苟道流/通用等)。
- 如AI无法输出JSON，则输出自然语言风格指导（兼容旧格式）。
- 示例：
[
  { "id": "hook", "type": "scene_end", "description": "每个场景结尾必须有强烈钩子，激发读者继续阅读", "trigger": "network_novel" },
  { "id": "爽点", "type": "scene_core", "description": "每场景需有至少一个爽点/反转/系统奖励", "trigger": "system_flow" }
]
- 条目数量7-10条，内容具体、可操作。
`;

    // 调用AI
    // const response = await callOpenAIWithRetry(() => 
    //   openai.chat.completions.create({
    //   model: activeConfig.model,
    //   messages: [{ role: 'user', content: prompt }],
    //   temperature: 0.7,
    //   })
    // );
    const apiResponse = await fetch('/api/ai/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeConfigId: activeConfig.id,
      model: activeConfig.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      }),
    });

    if (!apiResponse.ok) {
      throw new Error(`API request failed: ${await apiResponse.text()}`);
    }
    const response = await apiResponse.json();

    const styleGuideText = extractTextFromAIResponse(response);

    // 新增：尝试解析为JSON结构，若失败则fallback为原有自然语言
    let styleGuideToSave = styleGuideText;
    try {
      const parsed = JSON.parse(styleGuideText);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].description) {
        styleGuideToSave = JSON.stringify(parsed, null, 2); // 格式化存储
      }
    } catch (e) {
      // fallback: 保持原有自然语言格式
    }

    // 保存生成的风格指导到小说数据中
    await fetch(`/api/novels/${novelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style_guide: styleGuideToSave })
    });

    return styleGuideToSave;
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
  const novelResponse = await fetch(`/api/novels/${novelId}`, { cache: 'no-store' });
  if (!novelResponse.ok) {
    throw new Error("获取小说信息失败");
  }
  const novel = await novelResponse.json() as Novel;
  if (!novel) {
    throw new Error("小说信息未找到");
  }

  // 如果已有保存的风格指导且不为空，则直接返回
  if (novel.style_guide && novel.style_guide.trim().length > 0) {
    return novel.style_guide;
  }

  // 否则生成新的风格指导
  return await generateCustomStyleGuide(novelId);
}; 