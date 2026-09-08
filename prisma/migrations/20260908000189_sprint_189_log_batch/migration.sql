-- Sprint 189 schema batch: logistics domain (LOG-001..015).

CREATE TABLE "vehicle" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "plate" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity_kg" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vehicle_tenant_id_plate_key" ON "vehicle"("tenant_id", "plate");
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "driver" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "license_no" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "driver_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "driver_tenant_id_idx" ON "driver"("tenant_id");
ALTER TABLE "driver" ADD CONSTRAINT "driver_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "shipment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "shipment_number" TEXT NOT NULL,
  "carrier_key" TEXT,
  "vehicle_id" UUID,
  "driver_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "planned_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "freight_cost" DECIMAL(18,2),
  "currency" CHAR(3),
  "pod_name" TEXT,
  "pod_signature_hash" TEXT,
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shipment_tenant_id_shipment_number_key"
  ON "shipment"("tenant_id", "shipment_number");
CREATE INDEX "shipment_tenant_id_status_idx" ON "shipment"("tenant_id", "status");
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "shipment_stop" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "seq" INTEGER NOT NULL,
  "address" TEXT NOT NULL,
  "order_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "arrived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipment_stop_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shipment_stop_tenant_shipment_seq_key"
  ON "shipment_stop"("tenant_id", "shipment_id", "seq");
ALTER TABLE "shipment_stop" ADD CONSTRAINT "shipment_stop_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipment_stop" ADD CONSTRAINT "shipment_stop_shipment_id_fkey"
  FOREIGN KEY ("shipment_id") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "dock_appointment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "dock_code" TEXT NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "duration_min" INTEGER NOT NULL DEFAULT 60,
  "reference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'BOOKED',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dock_appointment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dock_appointment_tenant_wh_idx"
  ON "dock_appointment"("tenant_id", "warehouse_id", "scheduled_at");
ALTER TABLE "dock_appointment" ADD CONSTRAINT "dock_appointment_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dock_appointment" ADD CONSTRAINT "dock_appointment_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
