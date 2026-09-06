-- Sprints 053-055: promotions/vouchers, bundle components, serial numbers.

-- CreateEnum
CREATE TYPE "SerialPolicy" AS ENUM ('NONE', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "SerialStatus" AS ENUM ('IN_STOCK', 'SHIPPED', 'RETURNED', 'SCRAPPED');

-- AlterTable
ALTER TABLE "sku" ADD COLUMN "serial_policy" "SerialPolicy" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "promotion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL,
    "min_order_total" DECIMAL(18,2),
    "max_redemptions" INTEGER,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_redemption" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "promotion_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount_off" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_component" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "bundle_sku_id" UUID NOT NULL,
    "component_sku_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bundle_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serial_number" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "status" "SerialStatus" NOT NULL DEFAULT 'IN_STOCK',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serial_number_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotion_tenant_id_code_key" ON "promotion"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_redemption_tenant_id_promotion_id_order_id_key" ON "promotion_redemption"("tenant_id", "promotion_id", "order_id");

-- CreateIndex
CREATE INDEX "promotion_redemption_tenant_id_order_id_idx" ON "promotion_redemption"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "bundle_component_tenant_id_bundle_sku_id_component_sku_id_key" ON "bundle_component"("tenant_id", "bundle_sku_id", "component_sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "serial_number_tenant_id_sku_id_serial_key" ON "serial_number"("tenant_id", "sku_id", "serial");

-- CreateIndex
CREATE INDEX "serial_number_tenant_id_status_idx" ON "serial_number"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemption" ADD CONSTRAINT "promotion_redemption_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_component" ADD CONSTRAINT "bundle_component_bundle_sku_id_fkey" FOREIGN KEY ("bundle_sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_component" ADD CONSTRAINT "bundle_component_component_sku_id_fkey" FOREIGN KEY ("component_sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_number" ADD CONSTRAINT "serial_number_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
