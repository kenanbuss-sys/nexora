-- Sprint 017: customer 360 — credit profile and segmentation on accounts.

-- AlterTable
ALTER TABLE "crm_account" ADD COLUMN "credit_hold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "payment_terms_days" INTEGER,
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
