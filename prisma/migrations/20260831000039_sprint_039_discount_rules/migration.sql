-- Sprint 039: rule-based automatic discounts.

-- CreateTable
CREATE TABLE "discount_rule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "account_id" UUID,
    "sku_id" UUID,
    "min_qty" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "percentage" DECIMAL(5,2) NOT NULL,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discount_rule_tenant_id_active_idx" ON "discount_rule"("tenant_id", "active");

-- AddForeignKey
ALTER TABLE "discount_rule" ADD CONSTRAINT "discount_rule_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
