-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('idle', 'busy', 'locked');

-- CreateEnum
CREATE TYPE "CollectorRunStatus" AS ENUM ('running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "CollectorEvalStatus" AS ENUM ('pending', 'processing', 'done', 'skipped');

-- CreateTable
CREATE TABLE "GameProvider" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "sourceRoomId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "RoomStatus",
    "statusUpdatedAt" TIMESTAMP(3),
    "todayRtp" DECIMAL(7,2),
    "listCapturedAt" TIMESTAMP(3),
    "unopenedSpins" INTEGER,
    "prev1Spins" INTEGER,
    "prev2Spins" INTEGER,
    "todayBet" DECIMAL(16,2),
    "thirtyDayBet" DECIMAL(18,2),
    "thirtyDayRtp" DECIMAL(7,2),
    "detailCapturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectorRun" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "CollectorRunStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "roomsListed" INTEGER NOT NULL DEFAULT 0,
    "roomsDetailed" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "evalStatus" "CollectorEvalStatus",
    "evalAttempts" INTEGER NOT NULL DEFAULT 0,
    "evalLockedAt" TIMESTAMP(3),

    CONSTRAINT "CollectorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "roomId" TEXT NOT NULL,
    "collectorRunId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "status" "RoomStatus" NOT NULL,
    "todayRtp" DECIMAL(7,2) NOT NULL,
    "unopenedSpins" INTEGER,
    "prev1Spins" INTEGER,
    "prev2Spins" INTEGER,
    "todayBet" DECIMAL(16,2),
    "thirtyDayBet" DECIMAL(18,2),
    "thirtyDayRtp" DECIMAL(7,2),

    CONSTRAINT "RoomSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomDailyStat" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "todayRtp" DECIMAL(7,2) NOT NULL,
    "todayBet" DECIMAL(16,2),
    "capturedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectorAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "casinoUrl" TEXT NOT NULL,
    "accountEnc" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameProvider_code_key" ON "GameProvider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Game_providerId_code_key" ON "Game"("providerId", "code");

-- CreateIndex
CREATE INDEX "Room_gameId_detailCapturedAt_idx" ON "Room"("gameId", "detailCapturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Room_gameId_roomNo_key" ON "Room"("gameId", "roomNo");

-- CreateIndex
CREATE UNIQUE INDEX "Room_gameId_sourceRoomId_key" ON "Room"("gameId", "sourceRoomId");

-- CreateIndex
CREATE INDEX "CollectorRun_gameId_startedAt_idx" ON "CollectorRun"("gameId", "startedAt");

-- CreateIndex
CREATE INDEX "CollectorRun_evalStatus_startedAt_idx" ON "CollectorRun"("evalStatus", "startedAt");

-- CreateIndex
CREATE INDEX "RoomSnapshot_roomId_capturedAt_idx" ON "RoomSnapshot"("roomId", "capturedAt");

-- CreateIndex
CREATE INDEX "RoomSnapshot_capturedAt_idx" ON "RoomSnapshot"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoomSnapshot_collectorRunId_roomId_key" ON "RoomSnapshot"("collectorRunId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomDailyStat_roomId_date_key" ON "RoomDailyStat"("roomId", "date");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "GameProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectorRun" ADD CONSTRAINT "CollectorRun_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSnapshot" ADD CONSTRAINT "RoomSnapshot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSnapshot" ADD CONSTRAINT "RoomSnapshot_collectorRunId_fkey" FOREIGN KEY ("collectorRunId") REFERENCES "CollectorRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomDailyStat" ADD CONSTRAINT "RoomDailyStat_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

