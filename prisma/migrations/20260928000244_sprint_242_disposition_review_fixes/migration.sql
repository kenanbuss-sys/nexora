-- Sprint 242 review fixes (QMS-005): serials kept on disposition lines for
-- retries; no silent default for a hold's undecided quantity; rework links
-- are real foreign keys.
-- Rollback: ALTER TABLE "quarantine_disposition_line" DROP CONSTRAINT "quarantine_disposition_line_rework_hold_id_fkey", DROP COLUMN "serials";
--   ALTER TABLE "quarantine_hold" DROP CONSTRAINT "quarantine_hold_parent_hold_id_fkey";
--   ALTER TABLE "quarantine_hold" ALTER COLUMN "remaining_quantity" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "quarantine_disposition_line" ADD COLUMN     "serials" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "quarantine_hold" ALTER COLUMN "remaining_quantity" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "quarantine_hold" ADD CONSTRAINT "quarantine_hold_parent_hold_id_fkey" FOREIGN KEY ("parent_hold_id") REFERENCES "quarantine_hold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarantine_disposition_line" ADD CONSTRAINT "quarantine_disposition_line_rework_hold_id_fkey" FOREIGN KEY ("rework_hold_id") REFERENCES "quarantine_hold"("id") ON DELETE SET NULL ON UPDATE CASCADE;
