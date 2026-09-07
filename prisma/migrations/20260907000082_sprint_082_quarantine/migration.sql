-- Sprint 082: quarantine holds.

-- CreateEnum
CREATE TYPE "QuarantineStatus" AS ENUM ('ACTIVE', 'RELEASED', 'SCRAPPED');

-- CreateTable
CREATE TABLE "quarantine_hold" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "QuarantineStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT,
    "decided_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quarantine_hold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quarantine_hold_tenant_id_status_idx" ON "quarantine_hold"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "quarantine_hold_tenant_id_warehouse_id_sku_id_status_idx" ON "quarantine_hold"("tenant_id", "warehouse_id", "sku_id", "status");

-- AddForeignKey
ALTER TABLE "quarantine_hold" ADD CONSTRAINT "quarantine_hold_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
