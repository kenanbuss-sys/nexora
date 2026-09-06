-- Sprints 061-062: contract price lists, loyalty.

-- AlterTable
ALTER TABLE "price_list" ADD COLUMN "account_id" UUID;

-- CreateTable
CREATE TABLE "loyalty_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "loyalty_account_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "order_id" UUID,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_account_tenant_id_account_id_key" ON "loyalty_account"("tenant_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_transaction_tenant_id_order_id_reason_key" ON "loyalty_transaction"("tenant_id", "order_id", "reason");

-- CreateIndex
CREATE INDEX "loyalty_transaction_tenant_id_loyalty_account_id_idx" ON "loyalty_transaction"("tenant_id", "loyalty_account_id");

-- AddForeignKey
ALTER TABLE "loyalty_account" ADD CONSTRAINT "loyalty_account_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_loyalty_account_id_fkey" FOREIGN KEY ("loyalty_account_id") REFERENCES "loyalty_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
