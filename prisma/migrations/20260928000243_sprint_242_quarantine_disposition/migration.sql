-- Sprint 242 (QMS-005): material review dispositions on quarantine holds.
-- Rollback: DROP TABLE "quarantine_disposition_line"; DROP TABLE "quarantine_disposition";
--   ALTER TABLE "quarantine_hold" DROP CONSTRAINT "quarantine_hold_remaining_bounds",
--     DROP COLUMN "lot_number", DROP COLUMN "ncr_id", DROP COLUMN "parent_hold_id", DROP COLUMN "remaining_quantity";
--   UPDATE "quarantine_hold" SET status = 'RELEASED' WHERE status = 'DISPOSED'; (enum value stays — Postgres cannot drop it)
--   DROP TYPE "DispositionType"; DROP TYPE "DispositionStatus";
-- Ledger movements posted by dispositions are never rolled back (compensate with new movements).

-- CreateEnum
CREATE TYPE "DispositionType" AS ENUM ('USE_AS_IS', 'SCRAP', 'RETURN_TO_SUPPLIER', 'REGRADE', 'REWORK');

-- CreateEnum
CREATE TYPE "DispositionStatus" AS ENUM ('POSTING', 'POSTED', 'FAILED');

-- AlterEnum
ALTER TYPE "QuarantineStatus" ADD VALUE 'DISPOSED';

-- AlterTable
ALTER TABLE "quarantine_hold" ADD COLUMN     "lot_number" TEXT,
ADD COLUMN     "ncr_id" UUID,
ADD COLUMN     "parent_hold_id" UUID,
ADD COLUMN     "remaining_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "quarantine_disposition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "hold_id" UUID NOT NULL,
    "request_key" TEXT NOT NULL,
    "status" "DispositionStatus" NOT NULL DEFAULT 'POSTING',
    "note" TEXT,
    "last_error" TEXT,
    "decided_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMP(3),

    CONSTRAINT "quarantine_disposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarantine_disposition_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "disposition_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "type" "DispositionType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "target_sku_id" UUID,
    "target_quantity" DECIMAL(18,6),
    "supplier_ref" TEXT,
    "rework_hold_id" UUID,
    "movement_id" UUID,
    "target_movement_id" UUID,

    CONSTRAINT "quarantine_disposition_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quarantine_disposition_tenant_id_hold_id_idx" ON "quarantine_disposition"("tenant_id", "hold_id");

-- CreateIndex
CREATE UNIQUE INDEX "quarantine_disposition_tenant_id_request_key_key" ON "quarantine_disposition"("tenant_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "quarantine_disposition_line_disposition_id_line_no_key" ON "quarantine_disposition_line"("disposition_id", "line_no");

-- AddForeignKey
ALTER TABLE "quarantine_disposition" ADD CONSTRAINT "quarantine_disposition_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarantine_disposition" ADD CONSTRAINT "quarantine_disposition_hold_id_fkey" FOREIGN KEY ("hold_id") REFERENCES "quarantine_hold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarantine_disposition_line" ADD CONSTRAINT "quarantine_disposition_line_disposition_id_fkey" FOREIGN KEY ("disposition_id") REFERENCES "quarantine_disposition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: undecided quantity of existing ACTIVE holds.
UPDATE "quarantine_hold" SET "remaining_quantity" = "quantity" WHERE "status" = 'ACTIVE';

-- Not in schema.prisma — keep.
ALTER TABLE "quarantine_hold" ADD CONSTRAINT "quarantine_hold_remaining_bounds"
  CHECK ("remaining_quantity" >= 0 AND "remaining_quantity" <= "quantity");
ALTER TABLE "quarantine_disposition_line" ADD CONSTRAINT "quarantine_disposition_line_quantity_positive"
  CHECK ("quantity" > 0);
