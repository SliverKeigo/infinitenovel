import logger from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ModelConfig } from "@/types/ai";
import { generateInitialWorldElements } from "@/lib/generation/world";
import {
  generateMainOutline,
  generateDetailedOutline,
} from "@/lib/generation/outline";
import { readStreamToString } from "@/lib/utils/stream";
import { safelyParseJson } from "@/lib/utils/json";

// (Keep the existing schema definition)
const novelCreationRequestSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters long."),
  summary: z.string().min(10, "Summary must be at least 10 characters long."),
  presetChapters: z
    .number()
    .int()
    .positive("Preset chapters must be a positive integer."),
  category: z.string().min(1, "Category is required."),
  subCategory: z.string().min(1, "Sub-category is required."),
  generationConfig: z.custom<ModelConfig>((val) => {
    return (
      typeof val === "object" &&
      val !== null &&
      "apiKey" in val &&
      "model" in val
    );
  }, "A valid generation model configuration is required."),
});

/**
 * Handles the creation of a new novel, including generating the main outline
 * and the initial batch of detailed chapter outlines.
 */
export async function POST(request: Request) {
  try {
    // 1. Validate request body
    const body = await request.json();
    const validation = novelCreationRequestSchema.safeParse(body);

    if (!validation.success) {
      return new NextResponse(
        JSON.stringify({
          error: "Invalid request body",
          details: validation.error.flatten(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const {
      title,
      summary,
      category,
      subCategory,
      presetChapters,
      generationConfig,
    } = validation.data;

    // 2. Generate the main outline
    const mainOutlineStream = await generateMainOutline(
      title,
      summary,
      category,
      subCategory,
      generationConfig,
    );
    const mainOutline = await readStreamToString(mainOutlineStream);

    // 3. Create the novel record in the database with the main outline
    const newNovel = await prisma.novel.create({
      data: {
        title,
        summary,
        type: `${category} / ${subCategory}`,
        presetChapters,
        outline: mainOutline,
      },
    });

    logger.info(
      `Novel created with ID: ${newNovel.id}. Now generating initial detailed outline.`,
    );

    // 4. Generate the first batch of detailed outlines for the new novel
    const initialDetailedOutline = await generateDetailedOutline(
      newNovel.id,
      generationConfig,
    );

    // 6. Generate initial world-building elements
    const worldElements = await generateInitialWorldElements(
      mainOutline,
      initialDetailedOutline,
      generationConfig,
    );

    // 7. Save world elements and update novel with detailed outline in one transaction
    const transactionResult = await prisma.$transaction([
      prisma.novelRole.createMany({
        data: worldElements.roles.map((role) => ({
          novelId: newNovel.id,
          name: role.name,
          content: role.description,
        })),
      }),
      prisma.novelScene.createMany({
        data: worldElements.scenes.map((scene) => ({
          novelId: newNovel.id,
          name: scene.name,
          content: scene.description,
        })),
      }),
      prisma.novelClue.createMany({
        data: worldElements.clues.map((clue) => ({
          novelId: newNovel.id,
          name: clue.name,
          content: clue.description,
        })),
      }),
      prisma.novel.update({
        where: { id: newNovel.id },
        data: {
          detailedOutline: initialDetailedOutline,
        },
      }),
    ]);

    const fullyInitializedNovel = transactionResult[3];

    // 8. Return the fully initialized novel object
    return NextResponse.json(fullyInitializedNovel, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "An error occurred in POST /api/novels");
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
