-- Sprint 018: OMS depth — backordered order lines.

-- AlterTable
ALTER TABLE "sales_order_line" ADD COLUMN "backordered" BOOLEAN NOT NULL DEFAULT false;
