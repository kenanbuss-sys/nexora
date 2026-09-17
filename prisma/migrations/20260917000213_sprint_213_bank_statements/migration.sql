-- Sprint 213 — FIN-030/031: bank statements and payment allocation.

-- CreateEnum
CREATE TYPE "BankStatementStatus" AS ENUM ('IMPORTED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "BankStatementLineStatus" AS ENUM ('OPEN', 'PARTIALLY_ALLOCATED', 'ALLOCATED');

-- CreateTable
CREATE TABLE "bank_statement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "statement_number" TEXT NOT NULL,
    "bank_account" TEXT NOT NULL,
    "statement_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "opening_balance" DECIMAL(18,2) NOT NULL,
    "closing_balance" DECIMAL(18,2) NOT NULL,
    "line_count" INTEGER NOT NULL,
    "status" "BankStatementStatus" NOT NULL DEFAULT 'IMPORTED',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "booking_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "counterparty_name" TEXT,
    "counterparty_account" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "allocated_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "BankStatementLineStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "bank_statement_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "allocation_key" TEXT NOT NULL,
    "statement_line_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "payment_id" UUID,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_statement_tenant_id_legal_entity_id_status_idx" ON "bank_statement"("tenant_id", "legal_entity_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_tenant_id_legal_entity_id_statement_number_key" ON "bank_statement"("tenant_id", "legal_entity_id", "statement_number");

-- CreateIndex
CREATE INDEX "bank_statement_line_tenant_id_statement_id_idx" ON "bank_statement_line"("tenant_id", "statement_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_line_tenant_id_statement_id_seq_key" ON "bank_statement_line"("tenant_id", "statement_id", "seq");

-- CreateIndex
CREATE INDEX "payment_allocation_tenant_id_statement_line_id_idx" ON "payment_allocation"("tenant_id", "statement_line_id");

-- CreateIndex
CREATE INDEX "payment_allocation_tenant_id_invoice_id_idx" ON "payment_allocation"("tenant_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocation_tenant_id_allocation_key_key" ON "payment_allocation"("tenant_id", "allocation_key");

-- AddForeignKey
ALTER TABLE "bank_statement" ADD CONSTRAINT "bank_statement_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_line" ADD CONSTRAINT "bank_statement_line_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_line" ADD CONSTRAINT "bank_statement_line_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_statement_line_id_fkey" FOREIGN KEY ("statement_line_id") REFERENCES "bank_statement_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
