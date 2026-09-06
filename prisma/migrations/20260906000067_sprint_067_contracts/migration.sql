-- Sprint 067: contract repository.

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'TERMINATED');

-- CreateTable
CREATE TABLE "contract" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contract_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "party_id" UUID NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "renewal_notice_days" INTEGER NOT NULL DEFAULT 30,
    "value" DECIMAL(18,2),
    "currency" CHAR(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_tenant_id_contract_number_key" ON "contract"("tenant_id", "contract_number");

-- CreateIndex
CREATE INDEX "contract_tenant_id_status_idx" ON "contract"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "contract_tenant_id_ends_at_idx" ON "contract"("tenant_id", "ends_at");

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
