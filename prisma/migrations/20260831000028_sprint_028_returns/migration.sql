-- Sprint 028: returns (RMA).

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'CLOSED');

-- CreateTable
CREATE TABLE "return_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "rma_number" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "decision_note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_order_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "return_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_order_tenant_id_rma_number_key" ON "return_order"("tenant_id", "rma_number");

-- CreateIndex
CREATE INDEX "return_order_tenant_id_status_idx" ON "return_order"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "return_order_line_tenant_id_return_id_idx" ON "return_order_line"("tenant_id", "return_id");

-- AddForeignKey
ALTER TABLE "return_order" ADD CONSTRAINT "return_order_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_order_line" ADD CONSTRAINT "return_order_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_order_line" ADD CONSTRAINT "return_order_line_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "return_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
