-- Sprint 214 — FIN-032: compensation (open-item offsetting) and
-- controlled payment release (negative mirror payments).

-- CreateEnum
CREATE TYPE "CompensationStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompensationSide" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- AlterTable
ALTER TABLE "payment" ADD COLUMN "reverses_payment_id" UUID;

-- CreateTable
CREATE TABLE "compensation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "compensation_number" TEXT NOT NULL,
    "partner_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "booking_date" DATE NOT NULL,
    "status" "CompensationStatus" NOT NULL DEFAULT 'DRAFT',
    "gl_entry_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancel_reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compensation_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "compensation_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "side" "CompensationSide" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_id" UUID,

    CONSTRAINT "compensation_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compensation_tenant_id_legal_entity_id_status_idx" ON "compensation"("tenant_id", "legal_entity_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "compensation_tenant_id_legal_entity_id_compensation_number_key" ON "compensation"("tenant_id", "legal_entity_id", "compensation_number");

-- CreateIndex
CREATE INDEX "compensation_line_tenant_id_compensation_id_idx" ON "compensation_line"("tenant_id", "compensation_id");

-- CreateIndex
CREATE UNIQUE INDEX "compensation_line_tenant_id_compensation_id_invoice_id_key" ON "compensation_line"("tenant_id", "compensation_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_tenant_id_reverses_payment_id_key" ON "payment"("tenant_id", "reverses_payment_id");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_reverses_payment_id_fkey" FOREIGN KEY ("reverses_payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation" ADD CONSTRAINT "compensation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_line" ADD CONSTRAINT "compensation_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_line" ADD CONSTRAINT "compensation_line_compensation_id_fkey" FOREIGN KEY ("compensation_id") REFERENCES "compensation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_line" ADD CONSTRAINT "compensation_line_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
