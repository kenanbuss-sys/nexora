-- Sprint 232 — FIN-028: KUF/KIF books, effective-dated VAT rates and VAT
-- periods (BiH accounting localization pack). Additive only: three new
-- tenant-scoped tables, no existing table or data touched.
--
-- Rollback (only while the localization is unused; posted ledger entries
-- created by it stay in gl_* and are corrected by storno, never deleted):
--   DROP TABLE "vat_period"; DROP TABLE "vat_book_entry"; DROP TABLE "vat_rate";

-- CreateTable
CREATE TABLE "vat_rate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate_pct" DECIMAL(5,2) NOT NULL,
    "valid_from" DATE NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vat_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_book_entry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "book_type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "book_no" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "document_number" TEXT NOT NULL,
    "document_date" DATE NOT NULL,
    "booking_date" DATE NOT NULL,
    "partner_id" UUID NOT NULL,
    "partner_name" TEXT NOT NULL,
    "partner_tax_id" TEXT,
    "vat_rate_code" TEXT NOT NULL,
    "rate_pct" DECIMAL(5,2) NOT NULL,
    "net_amount" DECIMAL(18,2) NOT NULL,
    "vat_amount" DECIMAL(18,2) NOT NULL,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "counter_account_id" UUID NOT NULL,
    "invoice_id" UUID,
    "gl_entry_id" UUID,
    "storno_of_id" UUID,
    "storno_reason" TEXT,
    "request_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_book_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_period" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "output_vat" DECIMAL(18,2),
    "input_vat" DECIMAL(18,2),
    "payable_vat" DECIMAL(18,2),
    "settlement_entry_id" UUID,
    "filed_at" TIMESTAMP(3),
    "filed_by" TEXT,
    "paid_at" DATE,
    "paid_reference" TEXT,
    "paid_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_period_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vat_rate_tenant_id_legal_entity_id_code_idx" ON "vat_rate"("tenant_id", "legal_entity_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "vat_rate_tenant_id_legal_entity_id_code_valid_from_key" ON "vat_rate"("tenant_id", "legal_entity_id", "code", "valid_from");

-- CreateIndex
CREATE INDEX "vat_book_entry_tenant_id_legal_entity_id_book_type_booking__idx" ON "vat_book_entry"("tenant_id", "legal_entity_id", "book_type", "booking_date");

-- CreateIndex
CREATE INDEX "vat_book_entry_tenant_id_invoice_id_idx" ON "vat_book_entry"("tenant_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "vat_book_entry_tenant_id_request_key_key" ON "vat_book_entry"("tenant_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "vat_book_entry_tenant_id_legal_entity_id_book_type_year_boo_key" ON "vat_book_entry"("tenant_id", "legal_entity_id", "book_type", "year", "book_no");

-- CreateIndex
CREATE UNIQUE INDEX "vat_book_entry_tenant_id_storno_of_id_key" ON "vat_book_entry"("tenant_id", "storno_of_id");

-- CreateIndex
CREATE UNIQUE INDEX "vat_period_tenant_id_legal_entity_id_year_month_key" ON "vat_period"("tenant_id", "legal_entity_id", "year", "month");

-- AddForeignKey
ALTER TABLE "vat_rate" ADD CONSTRAINT "vat_rate_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_book_entry" ADD CONSTRAINT "vat_book_entry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_period" ADD CONSTRAINT "vat_period_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
