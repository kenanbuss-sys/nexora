-- Sprint 240 (PIM-005/007): stock movements keep the UOM/quantity as
-- entered; `quantity` stays the base-UOM ledger amount.
-- Rollback: ALTER TABLE "stock_movement" DROP COLUMN "entered_uom", DROP COLUMN "entered_quantity";
-- (purely additive, nullable; dropping loses only the entered-UOM trail)

-- AlterTable
ALTER TABLE "stock_movement" ADD COLUMN     "entered_quantity" DECIMAL(18,6),
ADD COLUMN     "entered_uom" TEXT;
