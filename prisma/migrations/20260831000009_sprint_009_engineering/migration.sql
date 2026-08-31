-- Sprint 009: Engineering — versioned BOMs, routings, change requests.

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('DRAFT', 'RELEASED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "EcStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'IMPLEMENTED');

-- CreateTable
CREATE TABLE "bom" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "RevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "bom_id" UUID NOT NULL,
    "component_sku_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "scrap_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bom_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "RevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_operation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "routing_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "work_center" TEXT NOT NULL,
    "setup_minutes" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "run_minutes_per_unit" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "instructions" TEXT,

    CONSTRAINT "routing_operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_change" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "ec_number" TEXT NOT NULL,
    "target_sku_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "EcStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "decided_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineering_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bom_tenant_id_sku_id_version_key" ON "bom"("tenant_id", "sku_id", "version");

-- CreateIndex
CREATE INDEX "bom_tenant_id_sku_id_status_idx" ON "bom"("tenant_id", "sku_id", "status");

-- CreateIndex
CREATE INDEX "bom_line_tenant_id_bom_id_idx" ON "bom_line"("tenant_id", "bom_id");

-- CreateIndex
CREATE INDEX "bom_line_tenant_id_component_sku_id_idx" ON "bom_line"("tenant_id", "component_sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "routing_tenant_id_sku_id_version_key" ON "routing"("tenant_id", "sku_id", "version");

-- CreateIndex
CREATE INDEX "routing_tenant_id_sku_id_status_idx" ON "routing"("tenant_id", "sku_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "routing_operation_tenant_id_routing_id_seq_key" ON "routing_operation"("tenant_id", "routing_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "engineering_change_tenant_id_ec_number_key" ON "engineering_change"("tenant_id", "ec_number");

-- CreateIndex
CREATE INDEX "engineering_change_tenant_id_status_idx" ON "engineering_change"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "bom" ADD CONSTRAINT "bom_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing" ADD CONSTRAINT "routing_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_operation" ADD CONSTRAINT "routing_operation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_operation" ADD CONSTRAINT "routing_operation_routing_id_fkey" FOREIGN KEY ("routing_id") REFERENCES "routing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_change" ADD CONSTRAINT "engineering_change_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
