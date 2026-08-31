-- Sprint 011: MES core — work orders and operation snapshots.

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WoOperationStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE');

-- CreateTable
CREATE TABLE "work_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "wo_number" TEXT NOT NULL,
    "sku_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "bom_id" UUID NOT NULL,
    "routing_id" UUID,
    "quantity" DECIMAL(18,6) NOT NULL,
    "good_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "scrap_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_operation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "work_center" TEXT NOT NULL,
    "status" "WoOperationStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "work_order_operation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_order_tenant_id_wo_number_key" ON "work_order"("tenant_id", "wo_number");

-- CreateIndex
CREATE INDEX "work_order_tenant_id_status_idx" ON "work_order"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_operation_tenant_id_work_order_id_seq_key" ON "work_order_operation"("tenant_id", "work_order_id", "seq");

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_operation" ADD CONSTRAINT "work_order_operation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_operation" ADD CONSTRAINT "work_order_operation_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
