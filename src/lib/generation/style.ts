import logger from "@/lib/logger";
import { ModelConfig } from "@/types/ai";
import { getChatCompletion } from "@/lib/ai-client";
import { safelyParseJson } from "@/lib/utils/json";
import { z } from "zod";

export const styleAndToneSchema = z.object({
  style: z
    .string()
    .describe("小说的写作风格，例如：'简洁有力'、'华丽细腻'或'幽默讽刺'。"),
  tone: z
    .string()
    .describe("小说的整体基调，例如：'史诗宏大'、'轻松愉快'或'黑暗压抑'。"),
});

export type StyleAndTone = z.infer<typeof styleAndToneSchema>;

/**
 * 根据小说信息生成写作风格和基调。
 *
 * @param title - 小说标题。
 * @param summary - 小说摘要。
 * @param mainOutline - 故事主线大纲。
 * @param generationConfig - AI 模型配置。
 * @returns 包含风格和基调的对象。
 */
export async function generateStyleAndTone(
  title: string,
  summary: string,
  mainOutline: string,
  generationConfig: ModelConfig,
  retries = 3,
): Promise<StyleAndTone> {
  const prompt = `
    你是一位经验丰富的文学评论家和小说家。请根据以下小说的核心信息，提炼出最适合它的**写作风格**和**整体基调**。

    **小说信息:**
    *   **标题:** ${title}
    *   **类型:** ${summary}
    *   **故事主线大纲:**
        ${mainOutline}

    **你的任务:**
    1.  **分析:** 深入分析以上信息，理解故事的核心冲突、世界观和情感走向。
    2.  **定义风格 (style):** 总结出一种最能体现文本特质的写作风格。
        *   例如: "文笔细腻，注重心理描写"、"节奏明快，对话驱动"、"史诗感与悲剧色彩并存"。
    3.  **定义基调 (tone):** 概括出整个故事最核心的情感氛围。
        *   例如: "充满希望与救赎"、"悬疑惊悚，步步为营"、"黑色幽默与社会讽刺"。

    **输出格式要求:**
    *   你必须返回一个纯粹的、格式正确的 JSON 对象。
    *   JSON 对象必须包含且仅包含两个键: "style" 和 "tone"。
    *   禁止在 JSON 内容之外包含任何文本、解释或注释。
    *   整个响应应直接以 \`{\` 开始，并以 \`}\` 结束。

    **示例输出:**
    {
      "style": "简洁干练，以动作场面和快节奏的情节推进为主",
      "tone": "紧张刺激，充满英雄主义和牺牲精神"
    }
  `;

  for (let i = 0; i < retries; i++) {
    try {
      logger.info(
        `正在为小说 "${title}" 生成写作风格和基调 (尝试次数 ${i + 1})...`,
      );

      const jsonResponse = await getChatCompletion(
        "生成风格和基调",
        generationConfig,
        prompt,
        { response_format: { type: "json_object" } },
      );

      if (typeof jsonResponse !== "string" || !jsonResponse) {
        throw new Error("AI 服务未返回有效的响应字符串。");
      }

      const parsedJson = safelyParseJson(jsonResponse);
      const validation = styleAndToneSchema.safeParse(parsedJson);

      if (!validation.success) {
        logger.error("AI 风格/基调响应验证失败:", validation.error.flatten());
        throw new Error(
          `AI 返回了格式错误的风格和基调。`,
        );
      }

      logger.info(`小说 "${title}" 的风格和基调已成功生成。`);
      return validation.data;
    } catch (error) {
      logger.warn(
        `生成风格和基调失败 (尝试次数 ${i + 1}/${retries}):`,
        error instanceof Error ? error.message : String(error),
      );
      if (i === retries - 1) {
        logger.error("已达到最大重试次数，生成风格和基调失败。");
        throw error;
      }
      await new Promise((res) => setTimeout(res, 1000 * (i + 1))); // 增加等待时间
    }
  }
  throw new Error("在所有重试后，生成风格和基调仍然失败。");
}
