-- Sprint 012: Quality — QC plans, inspections, NCRs.

-- CreateEnum
CREATE TYPE "QcInspectionStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "NcrSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NcrStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "qc_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qc_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_plan_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,

    CONSTRAINT "qc_plan_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_inspection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "inspection_number" TEXT NOT NULL,
    "work_order_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "QcInspectionStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qc_inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_inspection_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "passed" BOOLEAN,
    "note" TEXT,

    CONSTRAINT "qc_inspection_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ncr" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "ncr_number" TEXT NOT NULL,
    "work_order_id" UUID,
    "sku_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "NcrSeverity" NOT NULL DEFAULT 'MAJOR',
    "status" "NcrStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolved_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ncr_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qc_plan_tenant_id_sku_id_key" ON "qc_plan"("tenant_id", "sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_plan_item_tenant_id_plan_id_seq_key" ON "qc_plan_item"("tenant_id", "plan_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "qc_inspection_tenant_id_inspection_number_key" ON "qc_inspection"("tenant_id", "inspection_number");

-- CreateIndex
CREATE INDEX "qc_inspection_tenant_id_work_order_id_idx" ON "qc_inspection"("tenant_id", "work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_inspection_item_tenant_id_inspection_id_seq_key" ON "qc_inspection_item"("tenant_id", "inspection_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ncr_tenant_id_ncr_number_key" ON "ncr"("tenant_id", "ncr_number");

-- CreateIndex
CREATE INDEX "ncr_tenant_id_status_idx" ON "ncr"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "qc_plan" ADD CONSTRAINT "qc_plan_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_plan_item" ADD CONSTRAINT "qc_plan_item_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_plan_item" ADD CONSTRAINT "qc_plan_item_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "qc_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection" ADD CONSTRAINT "qc_inspection_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection_item" ADD CONSTRAINT "qc_inspection_item_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection_item" ADD CONSTRAINT "qc_inspection_item_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "qc_inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ncr" ADD CONSTRAINT "ncr_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
