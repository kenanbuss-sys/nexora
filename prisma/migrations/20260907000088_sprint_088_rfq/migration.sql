-- Sprint 088: RFQ.

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('DRAFT', 'SENT', 'AWARDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "rfq" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "rfq_number" TEXT NOT NULL,
    "sku_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "status" "RfqStatus" NOT NULL DEFAULT 'DRAFT',
    "due_at" TIMESTAMP(3),
    "awarded_quote_id" UUID,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_quote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "lead_time_days" INTEGER,
    "note" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfq_quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rfq_tenant_id_rfq_number_key" ON "rfq"("tenant_id", "rfq_number");

-- CreateIndex
CREATE INDEX "rfq_tenant_id_status_idx" ON "rfq"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_quote_tenant_id_rfq_id_supplier_id_key" ON "rfq_quote"("tenant_id", "rfq_id", "supplier_id");

-- AddForeignKey
ALTER TABLE "rfq" ADD CONSTRAINT "rfq_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_quote" ADD CONSTRAINT "rfq_quote_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
