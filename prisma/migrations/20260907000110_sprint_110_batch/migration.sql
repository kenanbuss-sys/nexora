-- Sprint 110 schema batch: custom objects (CORE-016/017) and framework
-- agreements (PROC-006).

CREATE TYPE "CustomObjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "FrameworkStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "custom_object_definition" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fields" JSONB NOT NULL,
  "status" "CustomObjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "custom_object_definition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "custom_object_definition_tenant_id_key_key"
  ON "custom_object_definition"("tenant_id", "key");
ALTER TABLE "custom_object_definition" ADD CONSTRAINT "custom_object_definition_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "custom_object_record" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "definition_id" UUID NOT NULL,
  "data" JSONB NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "custom_object_record_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "custom_object_record_tenant_id_definition_id_idx"
  ON "custom_object_record"("tenant_id", "definition_id");
ALTER TABLE "custom_object_record" ADD CONSTRAINT "custom_object_record_definition_id_fkey"
  FOREIGN KEY ("definition_id") REFERENCES "custom_object_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "framework_agreement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "agreement_number" TEXT NOT NULL,
  "supplier_id" UUID NOT NULL,
  "sku_id" UUID NOT NULL,
  "unit_price" DECIMAL(18,4) NOT NULL,
  "max_quantity" DECIMAL(18,6) NOT NULL,
  "called_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_to" TIMESTAMP(3),
  "status" "FrameworkStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "framework_agreement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "framework_agreement_tenant_id_agreement_number_key"
  ON "framework_agreement"("tenant_id", "agreement_number");
CREATE INDEX "framework_agreement_tenant_id_supplier_id_idx"
  ON "framework_agreement"("tenant_id", "supplier_id");
ALTER TABLE "framework_agreement" ADD CONSTRAINT "framework_agreement_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
