-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('verified', 'test', 'blacklisted');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "pictureUrl" TEXT,
    "vipLevel" INTEGER NOT NULL DEFAULT 0,
    "nickname" TEXT,
    "entertainmentMemberCode" TEXT,
    "entertainmentCodeBoundAt" TIMESTAMP(3),
    "points" INTEGER NOT NULL DEFAULT 0,
    "accountType" "AccountType" NOT NULL DEFAULT 'verified',
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "testSkipCost" BOOLEAN NOT NULL DEFAULT false,
    "testForcePrizeId" TEXT,
    "blacklistedAt" TIMESTAMP(3),
    "blacklistedByAdminUserId" TEXT,
    "blacklistReason" TEXT,
    "totalBurnAmount" INTEGER NOT NULL DEFAULT 0,
    "totalLuckAmount" INTEGER NOT NULL DEFAULT 0,
    "lifetimeDrawCount" INTEGER NOT NULL DEFAULT 0,
    "lifetimePayoutAmount" INTEGER NOT NULL DEFAULT 0,
    "lastWinDrawIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_lineUserId_key" ON "User"("lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_entertainmentMemberCode_key" ON "User"("entertainmentMemberCode");
