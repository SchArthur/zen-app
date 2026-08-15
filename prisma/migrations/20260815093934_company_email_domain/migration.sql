-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "emailDomain" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Company_emailDomain_key" ON "Company"("emailDomain");

