-- Sprint 243 (EAM-002): asset hierarchy (installed-in parent) and its
-- effective-dated, append-only structure history.
-- Rollback: DROP TABLE "asset_structure_change";
--   ALTER TABLE "asset" DROP CONSTRAINT "asset_parent_asset_id_fkey", DROP COLUMN "parent_asset_id";
-- (additive; dropping loses only the structure history)

-- AlterTable
ALTER TABLE "asset" ADD COLUMN     "parent_asset_id" UUID;

-- CreateTable
CREATE TABLE "asset_structure_change" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "from_parent_id" UUID,
    "to_parent_id" UUID,
    "reason" TEXT NOT NULL,
    "changed_by" TEXT,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_structure_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_structure_change_tenant_id_asset_id_effective_at_idx" ON "asset_structure_change"("tenant_id", "asset_id", "effective_at");

-- CreateIndex
CREATE INDEX "asset_structure_change_tenant_id_to_parent_id_idx" ON "asset_structure_change"("tenant_id", "to_parent_id");

-- CreateIndex
CREATE INDEX "asset_structure_change_tenant_id_from_parent_id_idx" ON "asset_structure_change"("tenant_id", "from_parent_id");

-- CreateIndex
CREATE INDEX "asset_tenant_id_parent_asset_id_idx" ON "asset"("tenant_id", "parent_asset_id");

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_parent_asset_id_fkey" FOREIGN KEY ("parent_asset_id") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_structure_change" ADD CONSTRAINT "asset_structure_change_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Not in schema.prisma — keep: an asset is never its own parent.
ALTER TABLE "asset" ADD CONSTRAINT "asset_not_own_parent" CHECK ("parent_asset_id" IS NULL OR "parent_asset_id" <> "id");
