-- Sprint 237 — HCM-017: employee development (training-plan templates per
-- qualification level, training plans, training/mentoring records), mentor
-- and qualification level on employee, typed bonuses on payroll
-- adjustments. Additive: four new tables and nullable columns only.
--
-- Rollback (only before use; plans and records are history):
--   DROP TABLE "training_record"; DROP TABLE "training_plan_item";
--   DROP TABLE "training_plan"; DROP TABLE "training_plan_template";
--   ALTER TABLE "employee" DROP COLUMN "mentor_user_id", DROP COLUMN "qualification_level";
--   ALTER TABLE "payroll_adjustment" DROP COLUMN "bonus_type",
--     DROP COLUMN "original_amount", DROP COLUMN "original_currency", DROP COLUMN "rate";

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "mentor_user_id" UUID,
ADD COLUMN     "qualification_level" TEXT;

-- AlterTable
ALTER TABLE "payroll_adjustment" ADD COLUMN     "bonus_type" TEXT,
ADD COLUMN     "original_amount" DECIMAL(18,2),
ADD COLUMN     "original_currency" CHAR(3),
ADD COLUMN     "rate" DECIMAL(18,6);

-- CreateTable
CREATE TABLE "training_plan_template" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "qualification_level" TEXT,
    "items" JSONB NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_plan_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "template_key" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "due_date" DATE NOT NULL,
    "recheck_date" DATE,
    "request_key" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_plan_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_plan_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "mentor_user_id" UUID,
    "session_date" DATE NOT NULL,
    "topic" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "outcome" TEXT,
    "recheck_date" DATE,
    "request_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_plan_template_tenant_id_key_version_key" ON "training_plan_template"("tenant_id", "key", "version");

-- CreateIndex
CREATE INDEX "training_plan_tenant_id_employee_id_status_idx" ON "training_plan"("tenant_id", "employee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "training_plan_tenant_id_request_key_key" ON "training_plan"("tenant_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "training_plan_item_tenant_id_plan_id_item_key_key" ON "training_plan_item"("tenant_id", "plan_id", "item_key");

-- CreateIndex
CREATE INDEX "training_record_tenant_id_employee_id_idx" ON "training_record"("tenant_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_record_tenant_id_request_key_key" ON "training_record"("tenant_id", "request_key");

-- AddForeignKey
ALTER TABLE "training_plan_template" ADD CONSTRAINT "training_plan_template_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plan" ADD CONSTRAINT "training_plan_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plan_item" ADD CONSTRAINT "training_plan_item_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plan_item" ADD CONSTRAINT "training_plan_item_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_record" ADD CONSTRAINT "training_record_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
