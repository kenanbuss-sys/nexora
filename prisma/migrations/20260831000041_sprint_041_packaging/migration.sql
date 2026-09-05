-- Sprint 041: packaging hierarchy.

-- CreateTable
CREATE TABLE "packaging_level" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "units_per_pack" DECIMAL(18,6) NOT NULL,
    "barcode_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packaging_level_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packaging_level_tenant_id_sku_id_name_key" ON "packaging_level"("tenant_id", "sku_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_level_tenant_id_barcode_value_key" ON "packaging_level"("tenant_id", "barcode_value");

-- AddForeignKey
ALTER TABLE "packaging_level" ADD CONSTRAINT "packaging_level_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_level" ADD CONSTRAINT "packaging_level_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
