/*
  Warnings:

  - Added the required column `actorRef` to the `AccessLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actorRole` to the `AccessLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AccessLog" DROP CONSTRAINT "AccessLog_actorId_fkey";

-- AlterTable
ALTER TABLE "AccessLog" ADD COLUMN     "actorRef" TEXT NOT NULL,
ADD COLUMN     "actorRole" "Role" NOT NULL,
ALTER COLUMN "actorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Exercise" ALTER COLUMN "steps" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "AccessLog_actorRef_createdAt_idx" ON "AccessLog"("actorRef", "createdAt");

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
