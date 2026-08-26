-- AlterTable
ALTER TABLE "Recipient" ADD COLUMN     "uploadRequirements" JSONB;

-- CreateTable
CREATE TABLE "EnvelopeUpload" (
    "id" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "documentDataId" TEXT NOT NULL,

    CONSTRAINT "EnvelopeUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnvelopeUpload_documentDataId_key" ON "EnvelopeUpload"("documentDataId");

-- CreateIndex
CREATE UNIQUE INDEX "EnvelopeUpload_recipientId_slotKey_key" ON "EnvelopeUpload"("recipientId", "slotKey");

-- CreateIndex
CREATE INDEX "EnvelopeUpload_envelopeId_idx" ON "EnvelopeUpload"("envelopeId");

-- CreateIndex
CREATE INDEX "EnvelopeUpload_recipientId_idx" ON "EnvelopeUpload"("recipientId");

-- AddForeignKey
ALTER TABLE "EnvelopeUpload" ADD CONSTRAINT "EnvelopeUpload_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeUpload" ADD CONSTRAINT "EnvelopeUpload_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeUpload" ADD CONSTRAINT "EnvelopeUpload_documentDataId_fkey" FOREIGN KEY ("documentDataId") REFERENCES "DocumentData"("id") ON DELETE CASCADE ON UPDATE CASCADE;
