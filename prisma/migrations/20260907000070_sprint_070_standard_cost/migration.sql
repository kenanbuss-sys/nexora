-- Sprint 070: standard cost on SKU (FIN-004/005).

-- AlterTable
ALTER TABLE "sku" ADD COLUMN "standard_cost" DECIMAL(18,4);
