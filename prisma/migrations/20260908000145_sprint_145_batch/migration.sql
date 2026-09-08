-- Sprint 145 schema batch: operator assignment + production confirmations
-- (MES-005/024), container/import tracking (PROC-010).

ALTER TABLE "work_order_operation" ADD COLUMN "assigned_to" TEXT;
ALTER TABLE "work_order_operation" ADD COLUMN "confirmed_qty" DECIMAL(18,3) NOT NULL DEFAULT 0;

CREATE TABLE "container" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "container_number" TEXT NOT NULL,
  "po_id" UUID,
  "carrier" TEXT,
  "status" TEXT NOT NULL DEFAULT 'BOOKED',
  "eta" TIMESTAMP(3),
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "container_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "container_tenant_id_container_number_key"
  ON "container"("tenant_id", "container_number");
CREATE INDEX "container_tenant_id_status_idx" ON "container"("tenant_id", "status");
ALTER TABLE "container" ADD CONSTRAINT "container_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "container" ADD CONSTRAINT "container_po_id_fkey"
  FOREIGN KEY ("po_id") REFERENCES "purchase_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
