-- CreateTable
CREATE TABLE "public"."Novel" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "outline" TEXT,
    "presetChapters" INTEGER NOT NULL,
    "currentWordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Novel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NovelChapter" (
    "id" UUID NOT NULL,
    "novelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NovelRole" (
    "id" UUID NOT NULL,
    "novelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NovelScene" (
    "id" UUID NOT NULL,
    "novelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NovelClue" (
    "id" UUID NOT NULL,
    "novelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelClue_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."NovelChapter" ADD CONSTRAINT "NovelChapter_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "public"."Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NovelRole" ADD CONSTRAINT "NovelRole_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "public"."Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NovelScene" ADD CONSTRAINT "NovelScene_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "public"."Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NovelClue" ADD CONSTRAINT "NovelClue_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "public"."Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateIndex
CREATE UNIQUE INDEX "NovelRole_novelId_name_key" ON "public"."NovelRole"("novelId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "NovelClue_novelId_name_key" ON "public"."NovelClue"("novelId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "NovelScene_novelId_name_key" ON "public"."NovelScene"("novelId", "name");
