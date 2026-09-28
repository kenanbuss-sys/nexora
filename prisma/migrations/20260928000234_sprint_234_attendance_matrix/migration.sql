-- Sprint 234 — HCM-015: attendance status matrix (šihtarica) and monthly
-- lock. Additive only: two new tenant-scoped tables; the HCM-003 clock
-- trail (audit events) and all existing data are untouched.
--
-- Rollback (history of changes stays in audit_event):
--   DROP TABLE "attendance_period"; DROP TABLE "attendance_day";

-- CreateTable
CREATE TABLE "attendance_day" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "status_key" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_period" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "unlock_reason" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_period_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_day_tenant_id_day_idx" ON "attendance_day"("tenant_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_day_tenant_id_employee_id_day_key" ON "attendance_day"("tenant_id", "employee_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_period_tenant_id_year_month_key" ON "attendance_period"("tenant_id", "year", "month");

-- AddForeignKey
ALTER TABLE "attendance_day" ADD CONSTRAINT "attendance_day_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_period" ADD CONSTRAINT "attendance_period_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
