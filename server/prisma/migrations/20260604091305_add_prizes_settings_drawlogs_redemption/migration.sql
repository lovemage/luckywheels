-- CreateEnum
CREATE TYPE "GatedBy" AS ENUM ('min_draws', 'cooldown', 'payout_cap');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('pending', 'delivered', 'cancelled');

-- CreateTable
CREATE TABLE "Prize" (
    "id" TEXT NOT NULL,
    "rankLabel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "wheelPosition" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "cashAmount" INTEGER NOT NULL DEFAULT 0,
    "segmentColor" TEXT NOT NULL DEFAULT '#9b3eb8',
    "textColor" TEXT NOT NULL DEFAULT '#fff5d6',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isConsolation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "totalWinAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'pending',
    "statusChangedAt" TIMESTAMP(3),
    "statusChangedByAdminUserId" TEXT,
    "cancelReason" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redemptionId" TEXT NOT NULL,
    "subIndex" INTEGER NOT NULL,
    "prizeId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "tierCost" INTEGER NOT NULL,
    "tierDraws" INTEGER NOT NULL,
    "pointsBefore" INTEGER NOT NULL,
    "pointsAfter" INTEGER NOT NULL,
    "randomSeed" TEXT NOT NULL,
    "winningCashAmount" INTEGER NOT NULL DEFAULT 0,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "forcedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "gatedBy" "GatedBy",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_code_key" ON "Redemption"("code");

-- CreateIndex
CREATE INDEX "Redemption_userId_createdAt_idx" ON "Redemption"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Redemption_status_createdAt_idx" ON "Redemption"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Redemption_isTest_createdAt_idx" ON "Redemption"("isTest", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_userId_idempotencyKey_key" ON "Redemption"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "DrawLog_userId_createdAt_idx" ON "DrawLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DrawLog_redemptionId_subIndex_key" ON "DrawLog"("redemptionId", "subIndex");

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawLog" ADD CONSTRAINT "DrawLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawLog" ADD CONSTRAINT "DrawLog_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "Redemption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawLog" ADD CONSTRAINT "DrawLog_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
