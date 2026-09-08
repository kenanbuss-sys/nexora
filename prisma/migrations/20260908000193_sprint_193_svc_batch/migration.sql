-- Sprint 193 schema batch: field service domain (SVC-001..015).

CREATE TABLE "installed_asset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "sku_id" UUID,
  "name" TEXT NOT NULL,
  "serial" TEXT,
  "location" TEXT,
  "installed_at" TIMESTAMP(3),
  "warranty_until" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "installed_asset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "installed_asset_tenant_id_account_id_idx"
  ON "installed_asset"("tenant_id", "account_id");
ALTER TABLE "installed_asset" ADD CONSTRAINT "installed_asset_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "service_request" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "request_number" TEXT NOT NULL,
  "account_id" UUID NOT NULL,
  "installed_asset_id" UUID,
  "subject" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "sla_due_at" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_request_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_request_tenant_id_request_number_key"
  ON "service_request"("tenant_id", "request_number");
CREATE INDEX "service_request_tenant_id_status_idx" ON "service_request"("tenant_id", "status");
ALTER TABLE "service_request" ADD CONSTRAINT "service_request_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_request" ADD CONSTRAINT "service_request_installed_asset_id_fkey"
  FOREIGN KEY ("installed_asset_id") REFERENCES "installed_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "service_order" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "order_number" TEXT NOT NULL,
  "request_id" UUID,
  "installed_asset_id" UUID,
  "account_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "scheduled_at" TIMESTAMP(3),
  "assigned_to" TEXT,
  "skills_required" JSONB,
  "report" TEXT,
  "proof_name" TEXT,
  "proof_signature_hash" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_order_tenant_id_order_number_key"
  ON "service_order"("tenant_id", "order_number");
CREATE INDEX "service_order_tenant_id_status_idx" ON "service_order"("tenant_id", "status");
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "service_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_installed_asset_id_fkey"
  FOREIGN KEY ("installed_asset_id") REFERENCES "installed_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "service_order_part" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "service_order_id" UUID NOT NULL,
  "sku_id" UUID NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_order_part_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "service_order_part_tenant_id_service_order_id_idx"
  ON "service_order_part"("tenant_id", "service_order_id");
ALTER TABLE "service_order_part" ADD CONSTRAINT "service_order_part_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_order_part" ADD CONSTRAINT "service_order_part_service_order_id_fkey"
  FOREIGN KEY ("service_order_id") REFERENCES "service_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "rma" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "rma_number" TEXT NOT NULL,
  "account_id" UUID NOT NULL,
  "order_id" UUID,
  "sku_id" UUID NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rma_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rma_tenant_id_rma_number_key" ON "rma"("tenant_id", "rma_number");
CREATE INDEX "rma_tenant_id_status_idx" ON "rma"("tenant_id", "status");
ALTER TABLE "rma" ADD CONSTRAINT "rma_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
