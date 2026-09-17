-- Sprint 211 (FIN-023/024/025/026): general-ledger core.

CREATE TABLE "gl_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "partner_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gl_account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gl_journal_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "entry_no" INTEGER,
    "entry_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "booking_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "storno_of_id" UUID,
    "stornoed_by_id" UUID,
    "posted_at" TIMESTAMP(3),
    "posted_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gl_journal_entry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gl_journal_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "partner_id" UUID,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "seq" INTEGER NOT NULL,
    CONSTRAINT "gl_journal_line_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gl_system_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "role_key" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gl_system_account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gl_opening_balance_date" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "opening_date" DATE NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gl_opening_balance_date_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gl_period_lock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "locked_through" DATE NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gl_period_lock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gl_account_tenant_id_legal_entity_id_code_key" ON "gl_account"("tenant_id", "legal_entity_id", "code");
CREATE INDEX "gl_account_tenant_id_legal_entity_id_partner_id_idx" ON "gl_account"("tenant_id", "legal_entity_id", "partner_id");
CREATE UNIQUE INDEX "gl_journal_entry_tenant_id_legal_entity_id_entry_no_key" ON "gl_journal_entry"("tenant_id", "legal_entity_id", "entry_no");
CREATE INDEX "gl_journal_entry_tenant_id_legal_entity_id_status_idx" ON "gl_journal_entry"("tenant_id", "legal_entity_id", "status");
CREATE UNIQUE INDEX "gl_journal_line_tenant_id_entry_id_seq_key" ON "gl_journal_line"("tenant_id", "entry_id", "seq");
CREATE INDEX "gl_journal_line_tenant_id_account_id_idx" ON "gl_journal_line"("tenant_id", "account_id");
CREATE UNIQUE INDEX "gl_system_account_tenant_id_legal_entity_id_role_key_key" ON "gl_system_account"("tenant_id", "legal_entity_id", "role_key");
CREATE UNIQUE INDEX "gl_opening_balance_date_tenant_id_legal_entity_id_key" ON "gl_opening_balance_date"("tenant_id", "legal_entity_id");
CREATE UNIQUE INDEX "gl_period_lock_tenant_id_legal_entity_id_key" ON "gl_period_lock"("tenant_id", "legal_entity_id");

ALTER TABLE "gl_account" ADD CONSTRAINT "gl_account_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gl_journal_entry" ADD CONSTRAINT "gl_journal_entry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gl_journal_line" ADD CONSTRAINT "gl_journal_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gl_journal_line" ADD CONSTRAINT "gl_journal_line_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "gl_journal_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gl_journal_line" ADD CONSTRAINT "gl_journal_line_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "gl_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gl_system_account" ADD CONSTRAINT "gl_system_account_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gl_opening_balance_date" ADD CONSTRAINT "gl_opening_balance_date_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gl_period_lock" ADD CONSTRAINT "gl_period_lock_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
