-- Sprint 235 — HCM-013/014: effective-dated salary data, payroll runs and
-- adjustments, and the employee management lock. Additive: four new
-- tenant-scoped tables plus one defaulted boolean column on "employee".
--
-- Rollback (only before payroll is used; confirmed runs are history):
--   DROP TABLE "payroll_line"; DROP TABLE "payroll_run";
--   DROP TABLE "payroll_adjustment"; DROP TABLE "employee_salary";
--   ALTER TABLE "employee" DROP COLUMN "salary_locked";

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "salary_locked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "employee_salary" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "net_amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "valid_from" DATE NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_salary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fund_days" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employee_number" TEXT NOT NULL,
    "employee_name" TEXT NOT NULL,
    "salary_locked" BOOLEAN NOT NULL,
    "salary_id" UUID NOT NULL,
    "base_net" DECIMAL(18,2) NOT NULL,
    "worked_days" INTEGER NOT NULL,
    "fund_days" INTEGER NOT NULL,
    "earned" DECIMAL(18,2) NOT NULL,
    "bonuses" DECIMAL(18,2) NOT NULL,
    "deductions" DECIMAL(18,2) NOT NULL,
    "net_total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "payroll_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_salary_tenant_id_employee_id_idx" ON "employee_salary"("tenant_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_salary_tenant_id_employee_id_valid_from_key" ON "employee_salary"("tenant_id", "employee_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_tenant_id_year_month_key" ON "payroll_run"("tenant_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_line_tenant_id_run_id_employee_id_key" ON "payroll_line"("tenant_id", "run_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_adjustment_tenant_id_year_month_idx" ON "payroll_adjustment"("tenant_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_adjustment_tenant_id_request_key_key" ON "payroll_adjustment"("tenant_id", "request_key");

-- AddForeignKey
ALTER TABLE "employee_salary" ADD CONSTRAINT "employee_salary_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line" ADD CONSTRAINT "payroll_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line" ADD CONSTRAINT "payroll_line_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustment" ADD CONSTRAINT "payroll_adjustment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
