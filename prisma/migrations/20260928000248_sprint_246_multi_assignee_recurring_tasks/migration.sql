-- Sprint 246 (WF-013): multi-assignee tasks with per-person status, recurring
-- task templates and their dated occurrences (checklists, daily log).
-- Rollback: DROP TABLE "task_assignee"; ALTER TABLE "task" DROP CONSTRAINT "task_template_id_fkey";
--   DROP INDEX "task_template_occurrence_key"; DROP TABLE "recurring_task_template";
--   ALTER TABLE "task" DROP COLUMN "completion_rule", DROP COLUMN "completed_at",
--     DROP COLUMN "template_id", DROP COLUMN "occurrence_date", DROP COLUMN "checklist";
-- (additive; dropping loses only multi-assignee/recurring detail)

-- AlterTable
ALTER TABLE "task" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "completion_rule" TEXT,
ADD COLUMN     "occurrence_date" DATE,
ADD COLUMN     "template_id" UUID;

-- CreateTable
CREATE TABLE "task_assignee" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMP(3),
    "completed_by" UUID,
    "note" TEXT,
    "results" JSONB,

    CONSTRAINT "task_assignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_task_template" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "day_of_month" INTEGER,
    "due_time" TEXT NOT NULL DEFAULT '23:59',
    "assignee_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completion_rule" TEXT NOT NULL DEFAULT 'ALL',
    "checklist" JSONB,
    "related_object_type" TEXT,
    "related_object_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_task_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_assignee_tenant_id_user_id_status_idx" ON "task_assignee"("tenant_id", "user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignee_task_id_user_id_key" ON "task_assignee"("task_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_task_template_tenant_id_code_key" ON "recurring_task_template"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "task_tenant_id_template_id_occurrence_date_idx" ON "task"("tenant_id", "template_id", "occurrence_date");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "recurring_task_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_task_template" ADD CONSTRAINT "recurring_task_template_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Not in schema.prisma — keep: one occurrence per template and date.
CREATE UNIQUE INDEX "task_template_occurrence_key" ON "task"("tenant_id", "template_id", "occurrence_date") WHERE "template_id" IS NOT NULL;
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_status_check" CHECK ("status" IN ('OPEN', 'DONE'));
ALTER TABLE "recurring_task_template" ADD CONSTRAINT "recurring_task_template_frequency_check" CHECK ("frequency" IN ('DAILY', 'WEEKLY', 'MONTHLY'));
