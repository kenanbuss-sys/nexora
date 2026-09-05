-- Sprint 025: PIM depth — categories, variants, attributes.

-- CreateTable
CREATE TABLE "product_category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_category_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "product" ADD COLUMN "category_id" UUID,
ADD COLUMN "variant_axes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "attributes" JSONB;

-- AlterTable
ALTER TABLE "sku" ADD COLUMN "variant_values" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "product_category_tenant_id_code_key" ON "product_category"("tenant_id", "code");

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
