-- Sprint 001: CORE (tenant, organization, configuration, audit) + IAM + outbox.

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('TENANT', 'LEGAL_ENTITY', 'BUSINESS_UNIT', 'BRANCH', 'FACTORY');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SERVICE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DISPATCHED', 'FAILED');

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_configuration_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID,

    CONSTRAINT "tenant_configuration_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_entity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_unit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "business_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "business_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "idp_subject" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" "ScopeType" NOT NULL DEFAULT 'TENANT',
    "scope_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "previous_values" JSONB,
    "new_values" JSONB,
    "reason" TEXT,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "correlation_id" TEXT NOT NULL,
    "causation_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dispatched_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_configuration_version_tenant_id_version_key" ON "tenant_configuration_version"("tenant_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entity_tenant_id_name_key" ON "legal_entity"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "business_unit_tenant_id_legal_entity_id_name_key" ON "business_unit"("tenant_id", "legal_entity_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "branch_tenant_id_business_unit_id_name_key" ON "branch"("tenant_id", "business_unit_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "factory_tenant_id_business_unit_id_name_key" ON "factory"("tenant_id", "business_unit_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "user_tenant_id_email_key" ON "user"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "user_tenant_id_idp_subject_idx" ON "user"("tenant_id", "idp_subject");

-- CreateIndex
CREATE UNIQUE INDEX "role_tenant_id_name_key" ON "role"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_role_id_permission_key_key" ON "role_permission"("role_id", "permission_key");

-- CreateIndex
CREATE INDEX "role_permission_tenant_id_idx" ON "role_permission"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignment_tenant_id_user_id_role_id_scope_type_s_key" ON "user_role_assignment"("tenant_id", "user_id", "role_id", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "user_role_assignment_tenant_id_user_id_idx" ON "user_role_assignment"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_event_tenant_id_object_type_object_id_idx" ON "audit_event"("tenant_id", "object_type", "object_id");

-- CreateIndex
CREATE INDEX "audit_event_tenant_id_occurred_at_idx" ON "audit_event"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_event_status_occurred_at_idx" ON "outbox_event"("status", "occurred_at");

-- AddForeignKey
ALTER TABLE "tenant_configuration_version" ADD CONSTRAINT "tenant_configuration_version_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_entity" ADD CONSTRAINT "legal_entity_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_unit" ADD CONSTRAINT "business_unit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_unit" ADD CONSTRAINT "business_unit_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_unit" ADD CONSTRAINT "business_unit_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "business_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch" ADD CONSTRAINT "branch_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch" ADD CONSTRAINT "branch_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory" ADD CONSTRAINT "factory_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factory" ADD CONSTRAINT "factory_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
