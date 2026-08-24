/*
  Warnings:

  - You are about to drop the column `note` on the `MoodCheckIn` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "steps" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- AlterTable
ALTER TABLE "MoodCheckIn" DROP COLUMN "note";
