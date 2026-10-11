-- Sprint 247 (CPQ made-to-measure): line spec snapshots on quotes/orders and
-- the customer price tier used for tier discounts.
-- Rollback: ALTER TABLE "quote_line" DROP COLUMN "spec"; ALTER TABLE "sales_order_line" DROP COLUMN "spec";
--   ALTER TABLE "crm_account" DROP COLUMN "price_tier";
-- (additive, nullable; dropping loses only the dimension/price breakdown snapshots)

-- AlterTable
ALTER TABLE "crm_account" ADD COLUMN     "price_tier" TEXT;

-- AlterTable
ALTER TABLE "quote_line" ADD COLUMN     "spec" JSONB;

-- AlterTable
ALTER TABLE "sales_order_line" ADD COLUMN     "spec" JSONB;
