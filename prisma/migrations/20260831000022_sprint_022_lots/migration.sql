-- Sprint 022: lot control & FEFO — lot policy on SKUs, lot dimension on
-- the stock ledger.

-- AlterTable
ALTER TABLE "sku" ADD COLUMN "lot_tracked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "shelf_life_days" INTEGER;

-- AlterTable
ALTER TABLE "stock_movement" ADD COLUMN "lot_number" TEXT,
ADD COLUMN "expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "stock_movement_tenant_id_sku_id_lot_number_idx" ON "stock_movement"("tenant_id", "sku_id", "lot_number");
