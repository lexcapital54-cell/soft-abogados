-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CEO', 'DIRECTOR_JURIDICO', 'ASESOR', 'SOCIO', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'RECOVERED', 'JUDICIAL', 'COMMERCIAL', 'CRITICAL', 'CLOSED');

-- CreateEnum
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CaseRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CaseStage" AS ENUM ('RECEPCION', 'ANALISIS', 'DOCUMENTACION', 'VALIDACION', 'RECLAMACION_EXTRAJUDICIAL', 'RESPUESTA_ENTIDAD', 'NEGOCIACION', 'DEMANDA', 'PROCESO_JUDICIAL', 'SENTENCIA', 'PAGO', 'ARCHIVO');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('SIN_CONTACTAR', 'CONTACTADO', 'INTERESADO', 'NO_INTERESADO', 'NO_LOCALIZADO', 'EN_NEGOCIACION');

-- CreateEnum
CREATE TYPE "KinshipType" AS ENUM ('CONYUGE', 'COMPANERO_PERMANENTE', 'HIJO', 'HIJA', 'PADRE', 'MADRE', 'HERMANO', 'HERMANA', 'NIETO', 'NIETA', 'OTRO');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('FALLECIDO', 'FAMILIAR', 'CONTRATO', 'PODER', 'JUDICIAL', 'FINANCIERO', 'OTRO');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('NO_SOLICITADO', 'SOLICITADO', 'PENDIENTE', 'CARGADO', 'EN_REVISION', 'RECHAZADO', 'APROBADO');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'WHATSAPP', 'SMS', 'MEETING', 'VISIT', 'PROMISE', 'FOLLOW_UP', 'STATUS_CHANGE', 'DOCUMENT_UPLOAD', 'DOCUMENT_REVIEW', 'ASSIGNMENT', 'PAYMENT', 'RECOVERY', 'COMMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FinancialProductType" AS ENUM ('SALDO_FIDUCIA', 'SALDO_FONDO_PENSION', 'SEGURO_VIDA', 'CUENTA_AHORROS', 'CDT', 'OTRO');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'NEGOTIATING', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "DistributionType" AS ENUM ('HONORARIOS', 'GASTO_OPERATIVO', 'PARTICIPACION_SOCIO', 'RESERVA');

-- CreateEnum
CREATE TYPE "PartnerAccountType" AS ENUM ('OPERATIVO', 'FINANCIERO', 'MIXTO');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SOLTERO', 'CASADO', 'UNION_LIBRE', 'DIVORCIADO', 'VIUDO', 'NO_ESPECIFICADO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'ASESOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "avatar_url" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nit" TEXT,
    "type" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deceased" (
    "id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL DEFAULT 'CC',
    "document_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3),
    "death_date" TIMESTAMP(3),
    "death_place" TEXT,
    "city" TEXT,
    "department" TEXT,
    "marital_status" "MaritalStatus" NOT NULL DEFAULT 'NO_ESPECIFICADO',
    "profession" TEXT,
    "last_address" TEXT,
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deceased_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "internal_code" TEXT NOT NULL,
    "file_number" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "stage" "CaseStage" NOT NULL DEFAULT 'RECEPCION',
    "priority" "CasePriority" NOT NULL DEFAULT 'MEDIUM',
    "risk_level" "CaseRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "recoverable_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "estimated_fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "collected_fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "documentary_progress" INTEGER NOT NULL DEFAULT 0,
    "city" TEXT,
    "department" TEXT,
    "observations" TEXT,
    "last_activity_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deceased_id" TEXT NOT NULL,
    "advisor_id" TEXT,
    "coordinator_id" TEXT,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_financial_products" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "entity_id" TEXT,
    "product_type" "FinancialProductType" NOT NULL,
    "product_name" TEXT,
    "account_number" TEXT,
    "recoverable_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "fees_percent" DECIMAL(5,2),
    "estimated_fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "claim_status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_financial_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_stage_history" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "from_stage" "CaseStage",
    "to_stage" "CaseStage" NOT NULL,
    "changed_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relatives" (
    "id" TEXT NOT NULL,
    "deceased_id" TEXT NOT NULL,
    "case_id" TEXT,
    "document_type" TEXT NOT NULL DEFAULT 'CC',
    "document_number" TEXT,
    "full_name" TEXT NOT NULL,
    "kinship" "KinshipType" NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "department" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "contact_status" "ContactStatus" NOT NULL DEFAULT 'SIN_CONTACTAR',
    "interest_level" INTEGER,
    "birth_serial" TEXT,
    "marriage_serial" TEXT,
    "doc_location" TEXT,
    "image_url" TEXT,
    "observations" TEXT,
    "advisor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "kinship" "KinshipType",
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "relative_id" TEXT,
    "document_type_id" TEXT,
    "name" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'NO_SOLICITADO',
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "storage_key" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "requested_at" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewer_id" TEXT,
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "uploaded_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "due_date" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "time_spent_min" INTEGER,
    "assignee_id" TEXT,
    "created_by_id" TEXT,
    "automation_code" TEXT,
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_activities" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "account_type" "PartnerAccountType" NOT NULL DEFAULT 'OPERATIVO',
    "default_share" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "capital_contributed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_distributions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "partner_account_id" TEXT,
    "type" "DistributionType" NOT NULL,
    "concept" TEXT NOT NULL,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "costs_deducted" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(18,2) NOT NULL,
    "share_percent" DECIMAL(8,6),
    "period_label" TEXT,
    "notes" TEXT,
    "distributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entities_nit_key" ON "financial_entities"("nit");

-- CreateIndex
CREATE INDEX "financial_entities_name_idx" ON "financial_entities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "deceased_document_number_key" ON "deceased"("document_number");

-- CreateIndex
CREATE INDEX "deceased_full_name_idx" ON "deceased"("full_name");

-- CreateIndex
CREATE INDEX "deceased_document_number_idx" ON "deceased"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "cases_internal_code_key" ON "cases"("internal_code");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "cases_stage_idx" ON "cases"("stage");

-- CreateIndex
CREATE INDEX "cases_priority_idx" ON "cases"("priority");

-- CreateIndex
CREATE INDEX "cases_advisor_id_idx" ON "cases"("advisor_id");

-- CreateIndex
CREATE INDEX "cases_file_number_idx" ON "cases"("file_number");

-- CreateIndex
CREATE INDEX "cases_created_at_idx" ON "cases"("created_at");

-- CreateIndex
CREATE INDEX "case_financial_products_case_id_idx" ON "case_financial_products"("case_id");

-- CreateIndex
CREATE INDEX "case_financial_products_entity_id_idx" ON "case_financial_products"("entity_id");

-- CreateIndex
CREATE INDEX "case_financial_products_claim_status_idx" ON "case_financial_products"("claim_status");

-- CreateIndex
CREATE INDEX "case_stage_history_case_id_idx" ON "case_stage_history"("case_id");

-- CreateIndex
CREATE INDEX "case_stage_history_created_at_idx" ON "case_stage_history"("created_at");

-- CreateIndex
CREATE INDEX "relatives_deceased_id_idx" ON "relatives"("deceased_id");

-- CreateIndex
CREATE INDEX "relatives_case_id_idx" ON "relatives"("case_id");

-- CreateIndex
CREATE INDEX "relatives_document_number_idx" ON "relatives"("document_number");

-- CreateIndex
CREATE INDEX "relatives_kinship_idx" ON "relatives"("kinship");

-- CreateIndex
CREATE INDEX "relatives_contact_status_idx" ON "relatives"("contact_status");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE INDEX "document_types_category_idx" ON "document_types"("category");

-- CreateIndex
CREATE INDEX "document_types_kinship_idx" ON "document_types"("kinship");

-- CreateIndex
CREATE INDEX "documents_case_id_idx" ON "documents"("case_id");

-- CreateIndex
CREATE INDEX "documents_relative_id_idx" ON "documents"("relative_id");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_category_idx" ON "documents"("category");

-- CreateIndex
CREATE INDEX "document_versions_document_id_idx" ON "document_versions"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_key" ON "document_versions"("document_id", "version");

-- CreateIndex
CREATE INDEX "tasks_case_id_idx" ON "tasks"("case_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_idx" ON "tasks"("assignee_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE INDEX "tasks_priority_idx" ON "tasks"("priority");

-- CreateIndex
CREATE INDEX "case_activities_case_id_idx" ON "case_activities"("case_id");

-- CreateIndex
CREATE INDEX "case_activities_type_idx" ON "case_activities"("type");

-- CreateIndex
CREATE INDEX "case_activities_created_at_idx" ON "case_activities"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "partner_accounts_user_id_key" ON "partner_accounts"("user_id");

-- CreateIndex
CREATE INDEX "financial_distributions_case_id_idx" ON "financial_distributions"("case_id");

-- CreateIndex
CREATE INDEX "financial_distributions_partner_account_id_idx" ON "financial_distributions"("partner_account_id");

-- CreateIndex
CREATE INDEX "financial_distributions_type_idx" ON "financial_distributions"("type");

-- CreateIndex
CREATE INDEX "financial_distributions_distributed_at_idx" ON "financial_distributions"("distributed_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_deceased_id_fkey" FOREIGN KEY ("deceased_id") REFERENCES "deceased"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_financial_products" ADD CONSTRAINT "case_financial_products_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_financial_products" ADD CONSTRAINT "case_financial_products_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "financial_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_stage_history" ADD CONSTRAINT "case_stage_history_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatives" ADD CONSTRAINT "relatives_deceased_id_fkey" FOREIGN KEY ("deceased_id") REFERENCES "deceased"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatives" ADD CONSTRAINT "relatives_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatives" ADD CONSTRAINT "relatives_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_relative_id_fkey" FOREIGN KEY ("relative_id") REFERENCES "relatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_activities" ADD CONSTRAINT "case_activities_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_activities" ADD CONSTRAINT "case_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_accounts" ADD CONSTRAINT "partner_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_distributions" ADD CONSTRAINT "financial_distributions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_distributions" ADD CONSTRAINT "financial_distributions_partner_account_id_fkey" FOREIGN KEY ("partner_account_id") REFERENCES "partner_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
