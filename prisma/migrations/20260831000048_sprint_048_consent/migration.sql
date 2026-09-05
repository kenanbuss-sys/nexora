-- Sprint 048: consent records (append-only).

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('EMAIL', 'PHONE', 'SMS', 'POST');

-- CreateTable
CREATE TABLE "consent_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "note" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" UUID,

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_record_tenant_id_party_id_channel_recorded_at_idx" ON "consent_record"("tenant_id", "party_id", "channel", "recorded_at");

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
