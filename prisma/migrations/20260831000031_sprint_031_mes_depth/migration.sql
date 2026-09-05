-- Sprint 031: MES depth — work centers and downtime.

-- CreateEnum
CREATE TYPE "DowntimeCategory" AS ENUM ('BREAKDOWN', 'SETUP', 'MATERIAL', 'QUALITY', 'OTHER');

-- CreateTable
CREATE TABLE "work_center" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downtime_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "work_center_id" UUID NOT NULL,
    "work_order_id" UUID,
    "category" "DowntimeCategory" NOT NULL DEFAULT 'OTHER',
    "minutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "downtime_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_center_tenant_id_code_key" ON "work_center"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "downtime_event_tenant_id_work_center_id_occurred_at_idx" ON "downtime_event"("tenant_id", "work_center_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "work_center" ADD CONSTRAINT "work_center_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_event" ADD CONSTRAINT "downtime_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_event" ADD CONSTRAINT "downtime_event_work_center_id_fkey" FOREIGN KEY ("work_center_id") REFERENCES "work_center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
