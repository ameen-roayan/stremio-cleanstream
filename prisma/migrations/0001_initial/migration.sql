-- CreateEnum
CREATE TYPE "TitleType" AS ENUM ('movie', 'series', 'episode');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('nudity', 'sex', 'violence', 'language', 'drugs', 'fear', 'discrimination', 'dispensable', 'commercial', 'intro', 'outro', 'recap', 'credits');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('both', 'video', 'audio');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('up', 'down');

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL,
    "imdbId" TEXT NOT NULL,
    "title" TEXT,
    "year" INTEGER,
    "type" "TitleType",
    "runtime" INTEGER,
    "posterUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "category" "Category" NOT NULL,
    "subcategory" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'high',
    "channel" "Channel" NOT NULL DEFAULT 'both',
    "comment" TEXT,
    "contributor" TEXT NOT NULL DEFAULT 'anonymous',
    "contributorIp" TEXT,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "releaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "runtime" INTEGER,
    "offsetMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "visitorId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "voteType" "VoteType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("visitorId","segmentId")
);

-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Title_imdbId_key" ON "Title"("imdbId");

-- CreateIndex
CREATE INDEX "Title_imdbId_idx" ON "Title"("imdbId");

-- CreateIndex
CREATE INDEX "Segment_titleId_idx" ON "Segment"("titleId");

-- CreateIndex
CREATE INDEX "Segment_category_idx" ON "Segment"("category");

-- CreateIndex
CREATE INDEX "Segment_verified_idx" ON "Segment"("verified");

-- CreateIndex
CREATE INDEX "Release_titleId_idx" ON "Release"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "Release_titleId_name_key" ON "Release"("titleId", "name");

-- CreateIndex
CREATE INDEX "Vote_segmentId_idx" ON "Vote"("segmentId");

-- CreateIndex
CREATE INDEX "ApiUsage_visitorId_createdAt_idx" ON "ApiUsage"("visitorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;
