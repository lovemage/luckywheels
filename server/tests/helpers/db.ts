import { prisma } from '../../src/db.js';

const TABLES = [
  'DrawLog',
  'Redemption',
  'Prize',
  'AppSetting',
  'AdminActionLog',
  'AdminUser',
  'User',
  // 數據助手
  'AssistantSignal',
  'AssistantExchange',
  'AssistantPass',
  'RoomSnapshot',
  'CollectorRun',
  'Room',
  'Game',
  'GameProvider',
  'CollectorAccount',
  'RecommendationLog',
] as const;

export async function resetDb(): Promise<void> {
  await prisma.$transaction(
    TABLES.map((t) => prisma.$executeRawUnsafe(`TRUNCATE "${t}" RESTART IDENTITY CASCADE`)),
  );
}
