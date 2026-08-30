-- Sprint 003: MDM (parties, merge redirects, external identities) + PIM
-- (products, SKUs, barcodes, UOM conversions).

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('PERSON', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('ACTIVE', 'MERGED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SkuStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISCONTINUED');

-- CreateTable
CREATE TABLE "party" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "party_type" "PartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "email" TEXT,
    "tax_id" TEXT,
    "status" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "merged_into_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_external_identity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "source_system" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "party_external_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sku" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_uom" TEXT NOT NULL,
    "status" "SkuStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barcode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "barcode_type" TEXT NOT NULL DEFAULT 'GTIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uom_conversion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "from_uom" TEXT NOT NULL,
    "to_uom" TEXT NOT NULL,
    "factor" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "uom_conversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "party_tenant_id_normalized_name_idx" ON "party"("tenant_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "party_external_identity_tenant_id_source_system_external_id_key" ON "party_external_identity"("tenant_id", "source_system", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_tenant_id_code_key" ON "product"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sku_tenant_id_code_key" ON "sku"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "barcode_tenant_id_value_key" ON "barcode"("tenant_id", "value");

-- CreateIndex
CREATE UNIQUE INDEX "uom_conversion_sku_id_from_uom_to_uom_key" ON "uom_conversion"("sku_id", "from_uom", "to_uom");

-- AddForeignKey
ALTER TABLE "party" ADD CONSTRAINT "party_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party" ADD CONSTRAINT "party_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_external_identity" ADD CONSTRAINT "party_external_identity_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku" ADD CONSTRAINT "sku_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barcode" ADD CONSTRAINT "barcode_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uom_conversion" ADD CONSTRAINT "uom_conversion_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
