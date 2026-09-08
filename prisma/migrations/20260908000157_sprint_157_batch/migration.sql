-- Sprint 157 schema batch: financial dimensions (FIN-001), POS sessions (COM-003).

ALTER TABLE "invoice" ADD COLUMN "dimensions" JSONB;

CREATE TABLE "pos_session" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "register_code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "opening_float" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "cash_sales" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "closing_count" DECIMAL(18,2),
  "opened_by" TEXT,
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_session_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pos_session_tenant_id_status_idx" ON "pos_session"("tenant_id", "status");
CREATE UNIQUE INDEX "pos_session_tenant_open_register_key"
  ON "pos_session"("tenant_id", "register_code") WHERE "status" = 'OPEN';
ALTER TABLE "pos_session" ADD CONSTRAINT "pos_session_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
