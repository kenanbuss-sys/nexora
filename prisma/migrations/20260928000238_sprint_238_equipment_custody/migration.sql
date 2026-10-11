-- Sprint 238 — EAM-015/016: equipment custody (revers with lines, partial
-- returns), asset location and a revocable QR token for the limited public
-- lookup. Additive: two new tables, two nullable asset columns.
--
-- Rollback (only before use; custody documents are history):
--   DROP INDEX "equipment_custody_line_one_open_per_asset";
--   DROP TABLE "equipment_custody_line"; DROP TABLE "equipment_custody";
--   ALTER TABLE "asset" DROP COLUMN "location", DROP COLUMN "qr_token";

-- AlterTable
ALTER TABLE "asset" ADD COLUMN     "location" TEXT,
ADD COLUMN     "qr_token" TEXT;

-- CreateTable
CREATE TABLE "equipment_custody" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "custody_number" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "group_token" TEXT NOT NULL,
    "note" TEXT,
    "request_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_custody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_custody_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "custody_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "asset_number" TEXT NOT NULL,
    "asset_name" TEXT NOT NULL,
    "returned_at" TIMESTAMP(3),
    "return_condition" TEXT,
    "return_note" TEXT,
    "returned_by" TEXT,

    CONSTRAINT "equipment_custody_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_custody_tenant_id_employee_id_status_idx" ON "equipment_custody"("tenant_id", "employee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_custody_tenant_id_custody_number_key" ON "equipment_custody"("tenant_id", "custody_number");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_custody_tenant_id_request_key_key" ON "equipment_custody"("tenant_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_custody_group_token_key" ON "equipment_custody"("group_token");

-- CreateIndex
CREATE INDEX "equipment_custody_line_tenant_id_asset_id_idx" ON "equipment_custody_line"("tenant_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_custody_line_tenant_id_custody_id_asset_id_key" ON "equipment_custody_line"("tenant_id", "custody_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_qr_token_key" ON "asset"("qr_token");

-- AddForeignKey
ALTER TABLE "equipment_custody" ADD CONSTRAINT "equipment_custody_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_custody_line" ADD CONSTRAINT "equipment_custody_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_custody_line" ADD CONSTRAINT "equipment_custody_line_custody_id_fkey" FOREIGN KEY ("custody_id") REFERENCES "equipment_custody"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An asset can be held in at most ONE open custody line (not expressible in
-- schema.prisma — keep when regenerating migrations).
CREATE UNIQUE INDEX "equipment_custody_line_one_open_per_asset"
  ON "equipment_custody_line" ("tenant_id", "asset_id")
  WHERE "returned_at" IS NULL;
