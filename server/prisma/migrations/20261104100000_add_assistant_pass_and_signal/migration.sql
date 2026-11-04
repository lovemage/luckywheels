-- CreateEnum
CREATE TYPE "AssistantExchangeKind" AS ENUM ('points_to_time', 'admin_adjust');

-- CreateEnum
CREATE TYPE "AssistantSignalEndReason" AS ENUM ('member_refresh', 'bonus_detected', 'rtp_changed', 'room_unavailable', 'data_stale');

-- CreateTable
CREATE TABLE "AssistantPass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantExchange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AssistantExchangeKind" NOT NULL,
    "pointsSpent" INTEGER NOT NULL DEFAULT 0,
    "pointsBefore" INTEGER,
    "pointsAfter" INTEGER,
    "hours" INTEGER NOT NULL,
    "expiresBefore" TIMESTAMP(3),
    "expiresAfter" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "adminUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantExchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "symbols" JSONB NOT NULL,
    "strength" INTEGER NOT NULL,
    "scoreAtIssue" INTEGER NOT NULL,
    "rtpAtIssue" DECIMAL(7,2) NOT NULL,
    "unopenedAtIssue" INTEGER,
    "prev1AtIssue" INTEGER,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" "AssistantSignalEndReason",

    CONSTRAINT "AssistantSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantPass_userId_key" ON "AssistantPass"("userId");

-- CreateIndex
CREATE INDEX "AssistantExchange_userId_createdAt_idx" ON "AssistantExchange"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantExchange_createdAt_idx" ON "AssistantExchange"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantExchange_userId_idempotencyKey_key" ON "AssistantExchange"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AssistantSignal_userId_endedAt_idx" ON "AssistantSignal"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "AssistantSignal_roomId_endedAt_idx" ON "AssistantSignal"("roomId", "endedAt");

-- CreateIndex
CREATE INDEX "AssistantSignal_issuedAt_idx" ON "AssistantSignal"("issuedAt");

-- AddForeignKey
ALTER TABLE "AssistantSignal" ADD CONSTRAINT "AssistantSignal_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

