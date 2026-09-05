-- Sprint 046: CRM sales teams.

-- CreateTable
CREATE TABLE "sales_team" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_team_member" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_team_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_team_tenant_id_code_key" ON "sales_team"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_team_member_tenant_id_team_id_user_id_key" ON "sales_team_member"("tenant_id", "team_id", "user_id");

-- AlterTable
ALTER TABLE "territory" ADD COLUMN "team_id" UUID;

-- AddForeignKey
ALTER TABLE "sales_team" ADD CONSTRAINT "sales_team_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_team_member" ADD CONSTRAINT "sales_team_member_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_team_member" ADD CONSTRAINT "sales_team_member_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "sales_team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
