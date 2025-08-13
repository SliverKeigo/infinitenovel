import logger from "@/lib/logger";
import { ModelConfig } from "@/types/ai";
import { getChatCompletion } from "@/lib/ai-client";
import { safelyParseJson } from "@/lib/utils/json";
import { readStreamToString } from "@/lib/utils/stream";
import { z } from "zod";
import { STYLE_AND_TONE_PROMPT } from "@/lib/prompts/style.prompts";
import { interpolatePrompt } from "@/lib/utils/prompt";

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
 */
export async function generateStyleAndTone(
  title: string,
  summary: string,
  generationConfig: ModelConfig,
  retries = 6,
): Promise<StyleAndTone> {
  const prompt = interpolatePrompt(STYLE_AND_TONE_PROMPT, {
    title,
    summary,
  });

  for (let i = 0; i < retries; i++) {
    try {
      logger.info(
        `正在为小说 "${title}" 生成写作风格和基调 (尝试次数 ${i + 1})...`,
      );

      const responseStream = await getChatCompletion(
        "生成风格和基调",
        generationConfig,
        prompt,
        { response_format: { type: "json_object" }, stream: true },
      );

      if (!responseStream || typeof responseStream === "string") {
        throw new Error("AI 服务未返回有效的响应流。");
      }

      const jsonResponse = await readStreamToString(responseStream);

      if (!jsonResponse) {
        throw new Error("从 AI 流中未能读取到任何内容。");
      }

      const parsedJson = safelyParseJson(jsonResponse);
      const validation = styleAndToneSchema.safeParse(parsedJson);

      if (!validation.success) {
        logger.error("AI 风格/基调响应验证失败:", validation.error.flatten());
        throw new Error(`AI 返回了格式错误的风格和基调。`);
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
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
  }
  throw new Error("在所有重试后，生成风格和基调仍然失败。");
}
