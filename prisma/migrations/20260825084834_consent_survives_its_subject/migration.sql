-- Écart E3 des normes (D3 du modèle) : la preuve du consentement ne disparaît
-- plus avec le compte. `userId` passe en SET NULL, `subjectRef` en conserve une
-- copie hors clé étrangère. Même mécanique que `AccessLog` au lot 6.

-- DropForeignKey
ALTER TABLE "Consent" DROP CONSTRAINT "Consent_userId_fkey";

-- AlterTable
ALTER TABLE "Consent" ADD COLUMN     "subjectRef" TEXT;

-- Reprise des lignes existantes : sans elle, la garantie ne vaudrait que pour
-- les consentements recueillis après cette migration, et la preuve des
-- décisions déjà prises resterait attachée à la seule clé étrangère.
UPDATE "Consent" SET "subjectRef" = "userId" WHERE "userId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Consent_subjectRef_type_createdAt_idx" ON "Consent"("subjectRef", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
