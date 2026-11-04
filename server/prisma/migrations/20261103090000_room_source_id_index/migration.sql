-- DropIndex
DROP INDEX "Room_gameId_sourceRoomId_key";

-- CreateIndex
CREATE INDEX "Room_gameId_sourceRoomId_idx" ON "Room"("gameId", "sourceRoomId");

