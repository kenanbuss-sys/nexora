-- Sprint 042: CRM sales territories.

-- CreateTable
CREATE TABLE "territory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "territory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "territory_tenant_id_code_key" ON "territory"("tenant_id", "code");

-- AlterTable
ALTER TABLE "crm_account" ADD COLUMN "territory_id" UUID;

-- AddForeignKey
ALTER TABLE "territory" ADD CONSTRAINT "territory_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
