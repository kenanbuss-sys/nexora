-- Sprint 015: B2B portal users.

-- CreateEnum
CREATE TYPE "PortalUserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "portal_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "idp_subject" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "status" "PortalUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_user_tenant_id_idp_subject_key" ON "portal_user"("tenant_id", "idp_subject");

-- CreateIndex
CREATE INDEX "portal_user_tenant_id_account_id_idx" ON "portal_user"("tenant_id", "account_id");

-- AddForeignKey
ALTER TABLE "portal_user" ADD CONSTRAINT "portal_user_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
