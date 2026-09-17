-- Sprint 222: idempotent portal ordering. The sales order row itself is
-- the idempotency record: a namespaced client request key plus a content
-- hash, written in the same insert as the order (atomic by construction).
-- Rollback: DROP INDEX "sales_order_tenant_id_request_key_key";
--           ALTER TABLE "sales_order" DROP COLUMN "request_key", DROP COLUMN "request_hash";
ALTER TABLE "sales_order"
  ADD COLUMN "request_key" TEXT,
  ADD COLUMN "request_hash" TEXT;

CREATE UNIQUE INDEX "sales_order_tenant_id_request_key_key"
  ON "sales_order"("tenant_id", "request_key");
