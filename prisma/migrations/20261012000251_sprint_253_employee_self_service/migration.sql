-- Sprint 253 (HCM-018): one employee per app user within a tenant — the
-- self-service identity (employee.user_id) must be unambiguous.
-- Partial unique index (raw SQL only; not expressible in schema.prisma —
-- keep it when regenerating migrations).
-- Rollback: DROP INDEX IF EXISTS "employee_tenant_user_key";
CREATE UNIQUE INDEX IF NOT EXISTS "employee_tenant_user_key"
  ON "employee" ("tenant_id", "user_id")
  WHERE "user_id" IS NOT NULL;
