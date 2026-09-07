-- Sprint 124 schema batch: channel content (PIM-009), SSCC (WMS-020),
-- unified order channel (COM-006), customer API keys (B2B-014).

ALTER TABLE "api_key" ADD COLUMN "account_id" UUID;

ALTER TABLE "package" ADD COLUMN "sscc_code" TEXT;

ALTER TABLE "sales_order" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'direct';

CREATE TABLE "sku_channel_content" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "sku_id" UUID NOT NULL,
  "channel" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "attributes" JSONB,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sku_channel_content_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sku_channel_content_tenant_id_sku_id_channel_key"
  ON "sku_channel_content"("tenant_id", "sku_id", "channel");
ALTER TABLE "sku_channel_content" ADD CONSTRAINT "sku_channel_content_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sku_channel_content" ADD CONSTRAINT "sku_channel_content_sku_id_fkey"
  FOREIGN KEY ("sku_id") REFERENCES "sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
