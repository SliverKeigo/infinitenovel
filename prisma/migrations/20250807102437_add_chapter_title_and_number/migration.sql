/*
  Warnings:

  - You are about to drop the column `name` on the `NovelChapter` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[novelId,chapterNumber]` on the table `NovelChapter` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `chapterNumber` to the `NovelChapter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `NovelChapter` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."NovelChapter" DROP COLUMN "name",
ADD COLUMN     "chapterNumber" INTEGER NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "NovelChapter_novelId_chapterNumber_key" ON "public"."NovelChapter"("novelId", "chapterNumber");
