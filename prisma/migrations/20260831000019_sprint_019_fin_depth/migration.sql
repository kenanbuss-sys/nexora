-- Sprint 019: financial depth — cost centers, budgets, invoice link.

-- CreateTable
CREATE TABLE "cost_center" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "period_key" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN "cost_center_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "cost_center_tenant_id_code_key" ON "cost_center"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "budget_tenant_id_cost_center_id_period_key_key" ON "budget"("tenant_id", "cost_center_id", "period_key");

-- AddForeignKey
ALTER TABLE "cost_center" ADD CONSTRAINT "cost_center_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
