-- Sprint 040: SKU substitutions.

-- CreateTable
CREATE TABLE "sku_substitution" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "substitute_sku_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sku_substitution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sku_substitution_tenant_id_sku_id_substitute_sku_id_key" ON "sku_substitution"("tenant_id", "sku_id", "substitute_sku_id");

-- CreateIndex
CREATE INDEX "sku_substitution_tenant_id_sku_id_idx" ON "sku_substitution"("tenant_id", "sku_id");

-- AddForeignKey
ALTER TABLE "sku_substitution" ADD CONSTRAINT "sku_substitution_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
