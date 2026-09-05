-- Sprint 047: effective-dated exchange rates.

-- CreateTable
CREATE TABLE "exchange_rate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "quote_currency" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_tenant_id_base_currency_quote_currency_valid__key" ON "exchange_rate"("tenant_id", "base_currency", "quote_currency", "valid_from");

-- CreateIndex
CREATE INDEX "exchange_rate_tenant_id_base_currency_quote_currency_idx" ON "exchange_rate"("tenant_id", "base_currency", "quote_currency");

-- AddForeignKey
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
