import logger from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ModelConfig } from "@/types/ai";
import { generateDetailedOutline } from "@/lib/generation/outline";

const generationRequestBodySchema = z.object({
  generationConfig: z.custom<ModelConfig>((val) => {
    return (
      typeof val === "object" &&
      val !== null &&
      "apiKey" in val &&
      "model" in val
    );
  }, "A valid generation model configuration is required."),
  chaptersToGenerate: z.number().int().positive().optional().default(5),
});

interface PostParams {
  params: {
    novelId: string;
  };
}

/**
 * Handles POST requests to generate and save a new batch of detailed outlines for a novel.
 */
export async function POST(request: Request, { params }: PostParams) {
  try {
    const { novelId } = params;

    // 1. Validate request body
    const body = await request.json();
    const validation = generationRequestBodySchema.safeParse(body);

    if (!validation.success) {
      return new NextResponse(
        JSON.stringify({
          error: "Invalid request body",
          details: validation.error.flatten(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { generationConfig, chaptersToGenerate } = validation.data;

    logger.info(
      `Received request to generate ${chaptersToGenerate} chapter outlines for novel ${novelId}.`,
    );

    // 2. Call the generation service
    const detailedOutlines = await generateDetailedOutline(
      novelId,
      generationConfig,
      chaptersToGenerate,
    );

    // 3. Save the generated outlines to the database
    // We append to the existing detailed outline if it exists
    await prisma.novel.update({
      where: { id: novelId },
      data: {
        detailedOutline: {
          push: detailedOutlines,
        },
      },
    });

    logger.info(
      `Successfully generated and saved new outlines for novel ${novelId}.`,
    );

    // 4. Return the newly generated outlines
    return NextResponse.json(detailedOutlines, { status: 201 });
  } catch (error) {
    logger.error(
      { err: error, novelId },
      `An error occurred in POST /api/novels/[novelId]/generate-chapters`,
    );
    const errorMessage =
      error instanceof Error
        ? error.message
        : "An internal server error occurred.";
    return new NextResponse(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
