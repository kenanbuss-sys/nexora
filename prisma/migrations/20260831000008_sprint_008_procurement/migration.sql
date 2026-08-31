-- Sprint 008: Procurement — suppliers, requisitions, purchase orders.

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "supplier" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "supplier_number" TEXT NOT NULL,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "lead_time_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requisition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "requisition_number" TEXT NOT NULL,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "approval_id" UUID,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requisition_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "requisition_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "est_unit_price" DECIMAL(18,4) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "purchase_requisition_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "requisition_id" UUID,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'OPEN',
    "currency" CHAR(3) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expected_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,
    "received_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_tenant_id_party_id_key" ON "supplier"("tenant_id", "party_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_tenant_id_supplier_number_key" ON "supplier"("tenant_id", "supplier_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requisition_tenant_id_requisition_number_key" ON "purchase_requisition"("tenant_id", "requisition_number");

-- CreateIndex
CREATE INDEX "purchase_requisition_tenant_id_status_idx" ON "purchase_requisition"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "purchase_requisition_line_tenant_id_requisition_id_idx" ON "purchase_requisition_line"("tenant_id", "requisition_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_tenant_id_po_number_key" ON "purchase_order"("tenant_id", "po_number");

-- CreateIndex
CREATE INDEX "purchase_order_tenant_id_status_idx" ON "purchase_order"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "purchase_order_tenant_id_supplier_id_idx" ON "purchase_order"("tenant_id", "supplier_id");

-- CreateIndex
CREATE INDEX "purchase_order_line_tenant_id_po_id_idx" ON "purchase_order_line"("tenant_id", "po_id");

-- CreateIndex
CREATE INDEX "purchase_order_line_tenant_id_sku_id_idx" ON "purchase_order_line"("tenant_id", "sku_id");

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition" ADD CONSTRAINT "purchase_requisition_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_line" ADD CONSTRAINT "purchase_requisition_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_line" ADD CONSTRAINT "purchase_requisition_line_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "purchase_requisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
