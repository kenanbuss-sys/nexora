-- Sprint 236 — HCM-016: employment contracts (rendered from DOC templates,
-- immutable text) with expiry tracking. Additive: one new tenant-scoped
-- table. Employee documents reuse the existing attachment tables.
--
-- Rollback (only before contracts are issued):
--   DROP TABLE "employment_contract";

-- CreateTable
CREATE TABLE "employment_contract" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "contract_number" TEXT NOT NULL,
    "contract_type" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "position" TEXT,
    "template_key" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contains_salary" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "terminated_on" DATE,
    "termination_reason" TEXT,
    "expiry_task_id" UUID,
    "request_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employment_contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employment_contract_tenant_id_employee_id_idx" ON "employment_contract"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "employment_contract_tenant_id_status_end_date_idx" ON "employment_contract"("tenant_id", "status", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "employment_contract_tenant_id_contract_number_key" ON "employment_contract"("tenant_id", "contract_number");

-- CreateIndex
CREATE UNIQUE INDEX "employment_contract_tenant_id_request_key_key" ON "employment_contract"("tenant_id", "request_key");

-- AddForeignKey
ALTER TABLE "employment_contract" ADD CONSTRAINT "employment_contract_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
