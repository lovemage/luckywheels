-- CreateTable
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "event" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "payloadBefore" JSONB,
    "payloadAfter" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminActionLog_event_createdAt_idx" ON "AdminActionLog"("event", "createdAt");

-- CreateIndex
CREATE INDEX "AdminActionLog_targetType_targetId_createdAt_idx" ON "AdminActionLog"("targetType", "targetId", "createdAt");
