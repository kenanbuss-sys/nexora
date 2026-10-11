-- Sprint 248: made-to-order flow — advance (ADVANCE) vs final invoices per
-- order, work orders linked to sales order lines, installation orders with
-- crew, vehicle and time slot.
-- Rollback: DROP INDEX "work_order_sales_order_line_key"; DROP INDEX "service_order_installation_per_sales_order_key";
--   DROP INDEX "service_order_tenant_id_slot_start_idx"; DROP INDEX "service_order_tenant_id_sales_order_id_idx";
--   ALTER TABLE "work_order" DROP COLUMN "sales_order_id", DROP COLUMN "sales_order_line_id", DROP COLUMN "spec";
--   ALTER TABLE "service_order" DROP CONSTRAINT "service_order_kind_check", DROP COLUMN "crew_employee_ids", DROP COLUMN "kind",
--     DROP COLUMN "quote_id", DROP COLUMN "sales_order_id", DROP COLUMN "site_address", DROP COLUMN "slot_end",
--     DROP COLUMN "slot_start", DROP COLUMN "vehicle_id";
--   (only if no ADVANCE invoices exist) DROP INDEX "invoice_tenant_id_invoice_type_order_ref_id_invoice_kind_key";
--   CREATE UNIQUE INDEX "invoice_tenant_id_invoice_type_order_ref_id_key" ON "invoice"("tenant_id", "invoice_type", "order_ref_id");
--   ALTER TABLE "invoice" DROP COLUMN "advance_deducted", DROP COLUMN "invoice_kind";

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "advance_deducted" DECIMAL(18,2),
ADD COLUMN     "invoice_kind" TEXT NOT NULL DEFAULT 'STANDARD';

-- CreateIndex (new uniqueness first, then the old one goes)
CREATE UNIQUE INDEX "invoice_tenant_id_invoice_type_order_ref_id_invoice_kind_key" ON "invoice"("tenant_id", "invoice_type", "order_ref_id", "invoice_kind");

-- DropIndex
DROP INDEX "invoice_tenant_id_invoice_type_order_ref_id_key";

-- AlterTable
ALTER TABLE "service_order" ADD COLUMN     "crew_employee_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'SERVICE',
ADD COLUMN     "quote_id" UUID,
ADD COLUMN     "sales_order_id" UUID,
ADD COLUMN     "site_address" TEXT,
ADD COLUMN     "slot_end" TIMESTAMP(3),
ADD COLUMN     "slot_start" TIMESTAMP(3),
ADD COLUMN     "vehicle_id" UUID;

-- AlterTable
ALTER TABLE "work_order" ADD COLUMN     "sales_order_id" UUID,
ADD COLUMN     "sales_order_line_id" UUID,
ADD COLUMN     "spec" JSONB;

-- CreateIndex
CREATE INDEX "service_order_tenant_id_slot_start_idx" ON "service_order"("tenant_id", "slot_start");

-- CreateIndex
CREATE INDEX "service_order_tenant_id_sales_order_id_idx" ON "service_order"("tenant_id", "sales_order_id");

-- Not in schema.prisma — keep.
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_kind_check" CHECK ("invoice_kind" IN ('STANDARD', 'ADVANCE'));
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_kind_check" CHECK ("kind" IN ('SERVICE', 'MEASUREMENT', 'INSTALLATION'));
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_slot_check" CHECK ("slot_start" IS NULL OR "slot_end" > "slot_start");
CREATE UNIQUE INDEX "work_order_sales_order_line_key" ON "work_order"("tenant_id", "sales_order_line_id") WHERE "sales_order_line_id" IS NOT NULL;
CREATE UNIQUE INDEX "service_order_installation_per_sales_order_key" ON "service_order"("tenant_id", "sales_order_id") WHERE "kind" = 'INSTALLATION' AND "status" <> 'CANCELLED';
