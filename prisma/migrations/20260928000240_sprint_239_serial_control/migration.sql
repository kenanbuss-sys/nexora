-- Sprint 239 — WMS-018: serial control on the stock ledger — current
-- position per serialised unit and its movement history. Additive: two
-- new tenant-scoped tables; the ledger itself is unchanged.
--
-- Rollback: DROP TABLE "serial_movement"; DROP TABLE "serial_position";

-- CreateTable
CREATE TABLE "serial_position" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "warehouse_id" UUID,
    "in_stock" BOOLEAN NOT NULL,
    "last_movement_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serial_position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serial_movement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "movement_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "serial_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "serial_position_tenant_id_sku_id_warehouse_id_in_stock_idx" ON "serial_position"("tenant_id", "sku_id", "warehouse_id", "in_stock");

-- CreateIndex
CREATE UNIQUE INDEX "serial_position_tenant_id_sku_id_serial_key" ON "serial_position"("tenant_id", "sku_id", "serial");

-- CreateIndex
CREATE INDEX "serial_movement_tenant_id_sku_id_serial_idx" ON "serial_movement"("tenant_id", "sku_id", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "serial_movement_tenant_id_movement_id_serial_key" ON "serial_movement"("tenant_id", "movement_id", "serial");

-- AddForeignKey
ALTER TABLE "serial_position" ADD CONSTRAINT "serial_position_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_movement" ADD CONSTRAINT "serial_movement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
