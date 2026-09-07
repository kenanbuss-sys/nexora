-- Sprint 102 schema batch: packing/staging, landed cost, split
-- fulfillment, click & collect, template lifecycle, project ordering.

CREATE TYPE "DocumentTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP');
CREATE TYPE "PackageStatus" AS ENUM ('PACKED', 'STAGED', 'SHIPPED');
CREATE TYPE "LandedCostType" AS ENUM ('FREIGHT', 'DUTY', 'INSURANCE', 'OTHER');

ALTER TABLE "document_template"
  ADD COLUMN "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "sales_order"
  ADD COLUMN "fulfillment_type" "FulfillmentType" NOT NULL DEFAULT 'DELIVERY',
  ADD COLUMN "project_ref" TEXT;

ALTER TABLE "sales_order_line"
  ADD COLUMN "fulfilled_qty" DECIMAL(18,6) NOT NULL DEFAULT 0;

CREATE TABLE "package" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "package_number" TEXT NOT NULL,
  "status" "PackageStatus" NOT NULL DEFAULT 'PACKED',
  "weight_kg" DECIMAL(10,3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "package_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "package_tenant_id_package_number_key" ON "package"("tenant_id", "package_number");
CREATE INDEX "package_tenant_id_order_id_idx" ON "package"("tenant_id", "order_id");
ALTER TABLE "package" ADD CONSTRAINT "package_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "package" ADD CONSTRAINT "package_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "sales_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "package_line" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "package_id" UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  CONSTRAINT "package_line_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "package_line_tenant_id_package_id_order_line_id_key"
  ON "package_line"("tenant_id", "package_id", "order_line_id");
ALTER TABLE "package_line" ADD CONSTRAINT "package_line_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "landed_cost" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "po_id" UUID NOT NULL,
  "cost_type" "LandedCostType" NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "note" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "landed_cost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "landed_cost_tenant_id_po_id_idx" ON "landed_cost"("tenant_id", "po_id");
ALTER TABLE "landed_cost" ADD CONSTRAINT "landed_cost_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "landed_cost" ADD CONSTRAINT "landed_cost_po_id_fkey"
  FOREIGN KEY ("po_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
