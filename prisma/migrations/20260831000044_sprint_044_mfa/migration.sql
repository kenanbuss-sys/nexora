-- Sprint 044: TOTP two-factor authentication.

-- AlterTable
ALTER TABLE "user_credential" ADD COLUMN "totp_secret" TEXT,
ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false;
