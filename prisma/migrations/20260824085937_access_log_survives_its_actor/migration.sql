-- DropForeignKey
ALTER TABLE "AccessLog" DROP CONSTRAINT "AccessLog_actorId_fkey";

-- AlterTable
ALTER TABLE "AccessLog"
ADD COLUMN "actorRef" TEXT,
ADD COLUMN "actorRole" "Role";

UPDATE "AccessLog" AS log
SET "actorRef" = log."actorId",
    "actorRole" = "User"."role"
FROM "User"
WHERE "User"."id" = log."actorId";

ALTER TABLE "AccessLog"
ALTER COLUMN "actorRef" SET NOT NULL,
ALTER COLUMN "actorRole" SET NOT NULL,
ALTER COLUMN "actorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Exercise" ALTER COLUMN "steps" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "AccessLog_actorRef_createdAt_idx" ON "AccessLog"("actorRef", "createdAt");

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
