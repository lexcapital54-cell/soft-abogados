-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('BUSCAR_NUEVOS_FAMILIARES', 'OBTENER_UBICAS_DATOS_CONTACTO', 'ACTUALIZAR_INFO_HEREDEROS', 'SOLICITAR_REGISTROS_CIVILES', 'AUTENTICAR_PODERES', 'VERIFICAR_PAZ_Y_SALVO', 'REVISION_JURIDICA_PREVIA', 'RADICAR_DEMANDA_O_CASO', 'SEGUIMIENTO_TRAMITE_JUZGADO', 'NEGOCIACION_ENTIDAD', 'LIQUIDACION_HONORARIOS', 'OTRO');

-- CreateEnum
CREATE TYPE "RepoCategoria" AS ENUM ('PLANTILLA', 'PORTAFOLIO', 'LEGAL');

-- CreateEnum
CREATE TYPE "EstadoEnvioCorreo" AS ENUM ('DELIVERED', 'FAILED');

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_case_id_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "case_id" TEXT;

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "fees_percent" DECIMAL(5,2) NOT NULL DEFAULT 30,
ADD COLUMN     "storage_folder_path" TEXT,
ADD COLUMN     "strategic_notes" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "original_file_name" TEXT,
ADD COLUMN     "sla_due_at" TIMESTAMP(3),
ADD COLUMN     "storage_url" TEXT;

-- AlterTable
ALTER TABLE "relatives" ADD COLUMN     "sla_due_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "task_type" "TaskType" NOT NULL DEFAULT 'OTRO',
ALTER COLUMN "case_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "corporate_repository" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "RepoCategoria" NOT NULL DEFAULT 'PLANTILLA',
    "url_acceso" TEXT NOT NULL,
    "storage_key" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "subido_por_id" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_send_logs" (
    "id" TEXT NOT NULL,
    "caso_id" TEXT NOT NULL,
    "remitente_id" TEXT NOT NULL,
    "destinatario_email" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "mensaje" TEXT,
    "documentos_adjuntos" TEXT[],
    "estado_envio" "EstadoEnvioCorreo" NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_send_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_notes" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "color_fondo" TEXT NOT NULL DEFAULT 'amber',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "corporate_repository_categoria_idx" ON "corporate_repository"("categoria");

-- CreateIndex
CREATE INDEX "corporate_repository_activo_idx" ON "corporate_repository"("activo");

-- CreateIndex
CREATE INDEX "email_send_logs_caso_id_idx" ON "email_send_logs"("caso_id");

-- CreateIndex
CREATE INDEX "email_send_logs_remitente_id_idx" ON "email_send_logs"("remitente_id");

-- CreateIndex
CREATE INDEX "email_send_logs_estado_envio_idx" ON "email_send_logs"("estado_envio");

-- CreateIndex
CREATE INDEX "email_send_logs_created_at_idx" ON "email_send_logs"("created_at");

-- CreateIndex
CREATE INDEX "personal_notes_usuario_id_idx" ON "personal_notes"("usuario_id");

-- CreateIndex
CREATE INDEX "audit_logs_case_id_idx" ON "audit_logs"("case_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "cases_storage_folder_path_key" ON "cases"("storage_folder_path");

-- CreateIndex
CREATE INDEX "relatives_sla_due_at_idx" ON "relatives"("sla_due_at");

-- CreateIndex
CREATE INDEX "tasks_task_type_idx" ON "tasks"("task_type");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_repository" ADD CONSTRAINT "corporate_repository_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_logs" ADD CONSTRAINT "email_send_logs_caso_id_fkey" FOREIGN KEY ("caso_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_logs" ADD CONSTRAINT "email_send_logs_remitente_id_fkey" FOREIGN KEY ("remitente_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_notes" ADD CONSTRAINT "personal_notes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

