-- Sprint 005: DEV device registry, VER verification events, WMS execution documents.

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('SCANNER', 'TABLET', 'PRINTER', 'SCALE', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ENROLLED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ScanKind" AS ENUM ('BARCODE', 'QR', 'RFID', 'NFC');

-- CreateEnum
CREATE TYPE "WmsOrderType" AS ENUM ('RECEIVING', 'TRANSFER', 'COUNT', 'PICK');

-- CreateEnum
CREATE TYPE "WmsOrderStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "device" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "device_type" "DeviceType" NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ENROLLED',
    "enrollment_token" TEXT NOT NULL,
    "capabilities" JSONB,
    "assigned_user_id" UUID,
    "branch_id" UUID,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "kind" "ScanKind" NOT NULL,
    "value" TEXT NOT NULL,
    "context" JSONB,
    "client_event_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" TEXT,
    "resolved_sku_id" UUID,

    CONSTRAINT "scan_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wms_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_type" "WmsOrderType" NOT NULL,
    "status" "WmsOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "warehouse_id" UUID NOT NULL,
    "to_warehouse_id" UUID,
    "reference" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "wms_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wms_order_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "expected_qty" DECIMAL(18,6) NOT NULL,
    "processed_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "wms_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_enrollment_token_key" ON "device"("enrollment_token");

-- CreateIndex
CREATE UNIQUE INDEX "device_tenant_id_code_key" ON "device"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "device_tenant_id_status_idx" ON "device"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scan_event_tenant_id_device_id_client_event_id_key" ON "scan_event"("tenant_id", "device_id", "client_event_id");

-- CreateIndex
CREATE INDEX "scan_event_tenant_id_received_at_idx" ON "scan_event"("tenant_id", "received_at");

-- CreateIndex
CREATE INDEX "wms_order_tenant_id_warehouse_id_status_idx" ON "wms_order"("tenant_id", "warehouse_id", "status");

-- CreateIndex
CREATE INDEX "wms_order_line_tenant_id_order_id_idx" ON "wms_order_line"("tenant_id", "order_id");

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_event" ADD CONSTRAINT "scan_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wms_order" ADD CONSTRAINT "wms_order_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wms_order_line" ADD CONSTRAINT "wms_order_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wms_order_line" ADD CONSTRAINT "wms_order_line_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "wms_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
