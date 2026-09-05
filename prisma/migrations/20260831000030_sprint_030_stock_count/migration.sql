-- Sprint 030: stock counting with governed adjustments.

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('OPEN', 'POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "stock_count" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "count_number" TEXT NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "created_by" TEXT,
    "posted_by" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "count_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "expected_qty" DECIMAL(18,6) NOT NULL,
    "counted_qty" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "stock_count_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_tenant_id_count_number_key" ON "stock_count"("tenant_id", "count_number");

-- CreateIndex
CREATE INDEX "stock_count_tenant_id_status_idx" ON "stock_count"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_line_count_id_sku_id_key" ON "stock_count_line"("count_id", "sku_id");

-- CreateIndex
CREATE INDEX "stock_count_line_tenant_id_count_id_idx" ON "stock_count_line"("tenant_id", "count_id");

-- AddForeignKey
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_count"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
