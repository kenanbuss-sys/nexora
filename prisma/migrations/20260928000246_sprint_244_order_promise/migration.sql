-- Sprint 244 (PLAN-015): committed promise dates on sales orders and lines.
-- Rollback: ALTER TABLE "sales_order" DROP COLUMN "promised_at"; ALTER TABLE "sales_order_line" DROP COLUMN "promised_at";
-- (additive, nullable; dropping loses only committed promise dates — they stay in the audit trail)

-- AlterTable
ALTER TABLE "sales_order" ADD COLUMN     "promised_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sales_order_line" ADD COLUMN     "promised_at" TIMESTAMP(3);
