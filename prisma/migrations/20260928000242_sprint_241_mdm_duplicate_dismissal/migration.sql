-- Sprint 241 (MDM-005): steward "not a duplicate" decisions per record pair.
-- Rollback: DROP TABLE "mdm_duplicate_dismissal";
-- (additive; dropping only makes dismissed pairs re-appear as candidates)

-- CreateTable
CREATE TABLE "mdm_duplicate_dismissal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "a_id" UUID NOT NULL,
    "b_id" UUID NOT NULL,
    "note" TEXT,
    "dismissed_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mdm_duplicate_dismissal_pkey" PRIMARY KEY ("id"),
    -- A pair is stored once, ordered (not in schema.prisma — keep).
    CONSTRAINT "mdm_duplicate_dismissal_ordered_pair" CHECK ("a_id" < "b_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mdm_duplicate_dismissal_tenant_id_entity_type_a_id_b_id_key" ON "mdm_duplicate_dismissal"("tenant_id", "entity_type", "a_id", "b_id");

-- AddForeignKey
ALTER TABLE "mdm_duplicate_dismissal" ADD CONSTRAINT "mdm_duplicate_dismissal_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
