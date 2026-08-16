-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "emailDomain" TEXT;

UPDATE "Company"
SET "emailDomain" = CONCAT('pending-', "id", '.invalid')
WHERE "emailDomain" IS NULL;

ALTER TABLE "Company" ALTER COLUMN "emailDomain" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Company_emailDomain_key" ON "Company"("emailDomain");
