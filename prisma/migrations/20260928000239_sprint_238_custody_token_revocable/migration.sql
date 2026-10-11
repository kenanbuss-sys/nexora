-- Sprint 238 (security review follow-up) — EAM-016: the revers QR group
-- token becomes revocable (NULL = revoked). Additive/relaxing only.
--
-- Rollback (only when no token is revoked):
--   ALTER TABLE "equipment_custody" ALTER COLUMN "group_token" SET NOT NULL;

ALTER TABLE "equipment_custody" ALTER COLUMN "group_token" DROP NOT NULL;
