-- Sprint 245 (CSM-011): case <-> order line linkage, returns opened from
-- cases, and an idempotency reference on returns (owned by OMS).
-- Rollback: DROP TABLE "support_case_return"; DROP TABLE "support_case_order_item";
--   DROP INDEX "support_case_tenant_id_order_id_idx"; DROP INDEX "return_order_request_ref_key";
--   ALTER TABLE "return_order" DROP COLUMN "request_ref";
-- (additive; dropping loses only the case-order detail and links)

-- AlterTable
ALTER TABLE "return_order" ADD COLUMN     "request_ref" TEXT;

-- CreateTable
CREATE TABLE "support_case_order_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "issue_type" TEXT NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_case_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_case_return" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "rma_number" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_case_return_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_case_order_item_tenant_id_order_id_idx" ON "support_case_order_item"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_case_order_item_case_id_order_line_id_key" ON "support_case_order_item"("case_id", "order_line_id");

-- CreateIndex
CREATE INDEX "support_case_return_tenant_id_case_id_idx" ON "support_case_return"("tenant_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_case_return_tenant_id_request_key_key" ON "support_case_return"("tenant_id", "request_key");

-- CreateIndex
CREATE INDEX "support_case_tenant_id_order_id_idx" ON "support_case"("tenant_id", "order_id");


-- AddForeignKey
ALTER TABLE "support_case_order_item" ADD CONSTRAINT "support_case_order_item_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_case_return" ADD CONSTRAINT "support_case_return_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Not in schema.prisma — keep: one return per caller reference.
CREATE UNIQUE INDEX "return_order_request_ref_key" ON "return_order"("tenant_id", "request_ref") WHERE "request_ref" IS NOT NULL;
ALTER TABLE "support_case_order_item" ADD CONSTRAINT "support_case_order_item_quantity_positive" CHECK ("quantity" > 0);
