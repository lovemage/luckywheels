ALTER TABLE "User" ALTER COLUMN "accountType" SET DEFAULT 'pending';

UPDATE "User"
SET "accountType" = 'pending'
WHERE "accountType" = 'verified'
  AND ("nickname" IS NULL OR "entertainmentMemberCode" IS NULL);
