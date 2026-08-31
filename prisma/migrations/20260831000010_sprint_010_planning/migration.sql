-- Sprint 010: MRP & planning — policies, runs, suggestions.

-- CreateEnum
CREATE TYPE "PlannedOrderType" AS ENUM ('PURCHASE', 'PRODUCTION');

-- CreateTable
CREATE TABLE "planning_policy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "safety_stock" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reorder_point" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lead_time_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrp_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "run_number" TEXT NOT NULL,
    "demand_skus" INTEGER NOT NULL DEFAULT 0,
    "suggestion_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrp_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrp_suggestion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "suggestion_type" "PlannedOrderType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "due_in_days" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mrp_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planning_policy_tenant_id_sku_id_key" ON "planning_policy"("tenant_id", "sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "mrp_run_tenant_id_run_number_key" ON "mrp_run"("tenant_id", "run_number");

-- CreateIndex
CREATE INDEX "mrp_run_tenant_id_created_at_idx" ON "mrp_run"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "mrp_suggestion_tenant_id_run_id_idx" ON "mrp_suggestion"("tenant_id", "run_id");

-- AddForeignKey
ALTER TABLE "planning_policy" ADD CONSTRAINT "planning_policy_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_run" ADD CONSTRAINT "mrp_run_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_suggestion" ADD CONSTRAINT "mrp_suggestion_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_suggestion" ADD CONSTRAINT "mrp_suggestion_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "mrp_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
