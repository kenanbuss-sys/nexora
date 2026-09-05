-- Sprint 049: SKU dimensions and weight.

-- AlterTable
ALTER TABLE "sku" ADD COLUMN "weight_kg" DECIMAL(12,3),
ADD COLUMN "length_cm" DECIMAL(10,1),
ADD COLUMN "width_cm" DECIMAL(10,1),
ADD COLUMN "height_cm" DECIMAL(10,1);
