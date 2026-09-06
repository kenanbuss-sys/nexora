-- Sprints 056-057: break-glass access, master data approvals.

-- CreateEnum
CREATE TYPE "MasterDataRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "break_glass_grant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "granted_by" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "break_glass_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "change_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "MasterDataRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_data_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "break_glass_grant_tenant_id_user_id_expires_at_idx" ON "break_glass_grant"("tenant_id", "user_id", "expires_at");

-- CreateIndex
CREATE INDEX "master_data_request_tenant_id_status_idx" ON "master_data_request"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "master_data_request_tenant_id_entity_type_entity_id_idx" ON "master_data_request"("tenant_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "break_glass_grant" ADD CONSTRAINT "break_glass_grant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_glass_grant" ADD CONSTRAINT "break_glass_grant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data_request" ADD CONSTRAINT "master_data_request_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
