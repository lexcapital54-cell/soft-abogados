import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentCategory,
  DocumentStatus,
  ActivityType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  buildCaseFolderPath,
  sanitizeFileName,
} from '../../common/utils/sanitize-folder-name';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.types';
import { UploadDocumentDto } from './dto/document.dto';
import { DOCUMENT_CHECKLIST } from './document-checklist';

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const GLOBAL_MANAGERS: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private isManager(role: UserRole): boolean {
    return GLOBAL_MANAGERS.includes(role);
  }

  private assertCaseAccess(
    advisorId: string | null | undefined,
    user: AuthUser,
  ): void {
    if (this.isManager(user.role)) return;
    if (advisorId !== user.id) {
      throw new ForbiddenException(
        'No tiene permiso sobre documentos de este caso',
      );
    }
  }

  private assertCanDelete(user: AuthUser): void {
    if (!this.isManager(user.role)) {
      throw new ForbiddenException(
        'Solo Super Admin / Dirección puede eliminar documentos',
      );
    }
  }

  private assertCanApprove(user: AuthUser): void {
    if (!this.isManager(user.role)) {
      throw new ForbiddenException(
        'Solo Super Admin / Dirección puede aprobar el estado final',
      );
    }
  }

  /** Upsert de tipos de documento del checklist */
  async syncDocumentTypes() {
    for (const t of DOCUMENT_CHECKLIST) {
      await this.prisma.documentType.upsert({
        where: { code: t.code },
        update: {
          name: t.name,
          category: t.category,
          isRequired: t.isRequired,
          sortOrder: t.sortOrder,
          isActive: true,
          description: t.scope,
        },
        create: {
          code: t.code,
          name: t.name,
          category: t.category,
          isRequired: t.isRequired,
          sortOrder: t.sortOrder,
          description: t.scope,
        },
      });
    }
  }

  /**
   * Precarga checklist PENDIENTE para el caso (titular + legal + por familiar).
   * Idempotente: no duplica filas existentes del mismo tipo.
   */
  async ensureChecklist(caseId: string, user: AuthUser) {
    await this.syncDocumentTypes();

    const caso = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        relatives: { select: { id: true } },
        deceased: { select: { documentNumber: true, fullName: true } },
      },
    });
    if (!caso) throw new NotFoundException('Caso no encontrado');
    this.assertCaseAccess(caso.advisorId, user);

    if (!caso.storageFolderPath) {
      const folderPath = buildCaseFolderPath(
        caso.deceased.documentNumber,
        caso.deceased.fullName,
      );
      await this.prisma.case.update({
        where: { id: caso.id },
        data: { storageFolderPath: folderPath },
      });
    }

    const types = await this.prisma.documentType.findMany({
      where: { code: { in: DOCUMENT_CHECKLIST.map((t) => t.code) } },
    });
    const typeByCode = new Map(types.map((t) => [t.code, t]));

    const existing = await this.prisma.document.findMany({
      where: { caseId },
      select: { documentTypeId: true, relativeId: true },
    });
    const existingKey = new Set(
      existing.map((d) => `${d.documentTypeId ?? ''}:${d.relativeId ?? ''}`),
    );

    const toCreate: Array<{
      caseId: string;
      relativeId: string | null;
      documentTypeId: string;
      name: string;
      category: DocumentCategory;
      status: DocumentStatus;
      isRequired: boolean;
      requestedAt: Date;
    }> = [];

    const now = new Date();

    for (const tpl of DOCUMENT_CHECKLIST) {
      const dt = typeByCode.get(tpl.code);
      if (!dt) continue;

      if (tpl.scope === 'FAMILIAR') {
        for (const rel of caso.relatives) {
          const key = `${dt.id}:${rel.id}`;
          if (existingKey.has(key)) continue;
          toCreate.push({
            caseId,
            relativeId: rel.id,
            documentTypeId: dt.id,
            name: tpl.name,
            category: tpl.category,
            status: DocumentStatus.PENDIENTE,
            isRequired: tpl.isRequired,
            requestedAt: now,
          });
          existingKey.add(key);
        }
      } else {
        const key = `${dt.id}:`;
        if (existingKey.has(key)) continue;
        toCreate.push({
          caseId,
          relativeId: null,
          documentTypeId: dt.id,
          name: tpl.name,
          category: tpl.category,
          status: DocumentStatus.PENDIENTE,
          isRequired: tpl.isRequired,
          requestedAt: now,
        });
        existingKey.add(key);
      }
    }

    if (toCreate.length) {
      await this.prisma.document.createMany({ data: toCreate });
    }

    return this.listByCaseGrouped(caseId, user);
  }

  async listByCaseGrouped(caseId: string, user: AuthUser) {
    const exists = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, advisorId: true, storageFolderPath: true },
    });
    if (!exists) throw new NotFoundException('Caso no encontrado');
    this.assertCaseAccess(exists.advisorId, user);

    const docs = await this.prisma.document.findMany({
      where: { caseId },
      include: {
        relative: {
          select: { id: true, fullName: true, kinship: true },
        },
        documentType: {
          select: { id: true, code: true, name: true, description: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const titular = docs.filter(
      (d) => !d.relativeId && d.documentType?.description === 'TITULAR',
    );
    const legal = docs.filter(
      (d) => !d.relativeId && d.documentType?.description === 'LEGAL',
    );
    const familiares = docs.filter((d) => !!d.relativeId);
    const known = new Set([
      ...titular.map((d) => d.id),
      ...legal.map((d) => d.id),
      ...familiares.map((d) => d.id),
    ]);
    const orphans = docs.filter((d) => !known.has(d.id));

    const cliente = [
      ...titular,
      ...legal,
      ...orphans.filter((d) => !d.relativeId),
    ];
    const fam = [
      ...familiares,
      ...orphans.filter((d) => !!d.relativeId),
    ];

    const required = docs.filter((d) => d.isRequired);
    const ready = required.filter(
      (d) =>
        d.status === DocumentStatus.APROBADO ||
        d.status === DocumentStatus.CARGADO,
    );

    return {
      storageFolderPath: exists.storageFolderPath,
      progress: {
        required: required.length,
        ready: ready.length,
        percent:
          required.length === 0
            ? 0
            : Math.round((ready.length / required.length) * 100),
      },
      titular,
      legal,
      cliente,
      familiares: fam,
    };
  }

  async listByCase(caseId: string, user: AuthUser) {
    const grouped = await this.listByCaseGrouped(caseId, user);
    return [
      ...grouped.titular,
      ...grouped.legal,
      ...grouped.familiares,
    ];
  }

  async upload(
    file: Express.Multer.File | undefined,
    dto: UploadDocumentDto,
    user: AuthUser,
    ip?: string | null,
  ) {
    if (!file) throw new BadRequestException('Debe adjuntar un archivo');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('El archivo supera el límite de 15 MB');
    }
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Formato no permitido. Use PDF, JPG o PNG.');
    }

    let target = dto.documentId
      ? await this.prisma.document.findUnique({
          where: { id: dto.documentId },
          include: {
            case: {
              include: {
                deceased: {
                  select: { documentNumber: true, fullName: true },
                },
              },
            },
          },
        })
      : null;

    if (dto.documentId && !target) {
      throw new NotFoundException('Documento del checklist no encontrado');
    }

    const caseId = target?.caseId ?? dto.caseId;
    const caso =
      target?.case ??
      (await this.prisma.case.findUnique({
        where: { id: caseId },
        include: {
          deceased: {
            select: { documentNumber: true, fullName: true },
          },
        },
      }));

    if (!caso) throw new NotFoundException('Caso no encontrado');
    this.assertCaseAccess(caso.advisorId, user);

    const folderPath =
      caso.storageFolderPath ??
      buildCaseFolderPath(
        caso.deceased.documentNumber,
        caso.deceased.fullName,
      );

    if (!caso.storageFolderPath) {
      await this.prisma.case.update({
        where: { id: caso.id },
        data: { storageFolderPath: folderPath },
      });
    }

    const sub =
      target?.relativeId != null
        ? `familiares/${target.relativeId}`
        : 'titular';
    const cleanName = sanitizeFileName(file.originalname);
    const stamped = `${Date.now()}_${cleanName}`;
    const stored = await this.storage.save(
      `${folderPath}/${sub}`,
      stamped,
      file.buffer,
    );

    // Asesor: deja en CARGADO/EN_REVISION; no puede aprobar
    const nextStatus = DocumentStatus.CARGADO;

    if (target) {
      const version = target.version + 1;
      const document = await this.prisma.document.update({
        where: { id: target.id },
        data: {
          status: nextStatus,
          storageKey: stored.storageKey,
          storageUrl: stored.storageUrl,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          uploadedAt: new Date(),
          version,
        },
      });

      await this.prisma.documentVersion.create({
        data: {
          documentId: document.id,
          version,
          storageKey: stored.storageKey,
          mimeType: file.mimetype,
          fileSize: file.size,
          uploadedBy: user.id,
          notes: 'Carga checklist',
        },
      });

      await this.prisma.caseActivity.create({
        data: {
          caseId: caso.id,
          userId: user.id,
          type: ActivityType.DOCUMENT_UPLOAD,
          title: `Documento cargado: ${document.name}`,
          description: file.originalname,
          metadata: { documentId: document.id, storageKey: stored.storageKey },
        },
      });

      await this.refreshDocumentaryProgress(caso.id);

      this.audit.registrarAuditoria({
        usuarioId: user.id,
        accion: AuditAction.DOCUMENTO_CARGADO,
        entidadAfectada: AuditEntity.DOCUMENTO,
        entidadId: document.id,
        caseId: caso.id,
        prevData: { status: target.status, version: target.version },
        newData: {
          status: document.status,
          version: document.version,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
        },
        ipAddress: ip,
      });

      return {
        document,
        folderPath: `/${folderPath}/`,
        storageKey: stored.storageKey,
        storageUrl: stored.storageUrl,
      };
    }

    // Carga libre (sin fila checklist)
    const document = await this.prisma.document.create({
      data: {
        caseId: caso.id,
        relativeId: dto.relativeId || null,
        name: dto.tipoDocumento || file.originalname,
        category: dto.category ?? DocumentCategory.OTRO,
        status: nextStatus,
        storageKey: stored.storageKey,
        storageUrl: stored.storageUrl,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedAt: new Date(),
        version: 1,
      },
    });

    await this.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        storageKey: stored.storageKey,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedBy: user.id,
      },
    });

    await this.prisma.caseActivity.create({
      data: {
        caseId: caso.id,
        userId: user.id,
        type: ActivityType.DOCUMENT_UPLOAD,
        title: `Documento cargado: ${document.name}`,
        description: file.originalname,
      },
    });

    await this.refreshDocumentaryProgress(caso.id);

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.DOCUMENTO_CARGADO,
      entidadAfectada: AuditEntity.DOCUMENTO,
      entidadId: document.id,
      caseId: caso.id,
      newData: {
        status: document.status,
        name: document.name,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      },
      ipAddress: ip,
    });

    return {
      document,
      folderPath: `/${folderPath}/`,
      storageKey: stored.storageKey,
      storageUrl: stored.storageUrl,
    };
  }

  async updateStatus(
    documentId: string,
    status: DocumentStatus,
    user: AuthUser,
    ip?: string | null,
  ) {
    if (
      status === DocumentStatus.APROBADO ||
      status === DocumentStatus.RECHAZADO
    ) {
      this.assertCanApprove(user);
    }

    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { case: { select: { id: true, advisorId: true } } },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    this.assertCaseAccess(doc.case.advisorId, user);

    const advisorAllowed: DocumentStatus[] = [
      DocumentStatus.PENDIENTE,
      DocumentStatus.CARGADO,
      DocumentStatus.EN_REVISION,
      DocumentStatus.SOLICITADO,
    ];
    if (!this.isManager(user.role) && !advisorAllowed.includes(status)) {
      throw new ForbiddenException('Estado no permitido para su rol');
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status,
        reviewedAt: this.isManager(user.role) ? new Date() : doc.reviewedAt,
        reviewerId: this.isManager(user.role) ? user.id : doc.reviewerId,
      },
    });

    await this.prisma.caseActivity.create({
      data: {
        caseId: doc.caseId,
        userId: user.id,
        type: ActivityType.DOCUMENT_REVIEW,
        title: `Estado documental: ${doc.name}`,
        description: `${doc.status} → ${status}`,
      },
    });

    await this.refreshDocumentaryProgress(doc.caseId);

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.CAMBIO_ESTADO_DOCUMENTO,
      entidadAfectada: AuditEntity.DOCUMENTO,
      entidadId: documentId,
      caseId: doc.caseId,
      prevData: { status: doc.status, name: doc.name },
      newData: { status, name: updated.name },
      ipAddress: ip,
    });

    return updated;
  }

  async remove(documentId: string, user: AuthUser, ip?: string | null) {
    this.assertCanDelete(user);
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const prevSnapshot = {
      status: doc.status,
      name: doc.name,
      storageKey: doc.storageKey,
      originalFileName: doc.originalFileName,
    };

    // Soft reset to checklist pendiente (conserva la fila) si tiene tipo
    if (doc.documentTypeId) {
      const reset = await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.PENDIENTE,
          storageKey: null,
          storageUrl: null,
          originalFileName: null,
          mimeType: null,
          fileSize: null,
          uploadedAt: null,
          reviewedAt: null,
          reviewerId: null,
        },
      });
      await this.refreshDocumentaryProgress(doc.caseId);

      this.audit.registrarAuditoria({
        usuarioId: user.id,
        accion: AuditAction.DOCUMENTO_ELIMINADO,
        entidadAfectada: AuditEntity.DOCUMENTO,
        entidadId: documentId,
        caseId: doc.caseId,
        prevData: prevSnapshot,
        newData: { reset: true, status: reset.status },
        ipAddress: ip,
      });

      return { ok: true, reset: true, document: reset };
    }

    await this.prisma.document.delete({ where: { id: documentId } });
    await this.refreshDocumentaryProgress(doc.caseId);

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.DOCUMENTO_ELIMINADO,
      entidadAfectada: AuditEntity.DOCUMENTO,
      entidadId: documentId,
      caseId: doc.caseId,
      prevData: prevSnapshot,
      newData: { deleted: true },
      ipAddress: ip,
    });

    return { ok: true, deleted: true };
  }

  private async refreshDocumentaryProgress(caseId: string) {
    const docs = await this.prisma.document.findMany({
      where: { caseId, isRequired: true },
      select: { status: true },
    });
    const ready = docs.filter(
      (d) =>
        d.status === DocumentStatus.APROBADO ||
        d.status === DocumentStatus.CARGADO,
    ).length;
    const percent =
      docs.length === 0 ? 0 : Math.round((ready / docs.length) * 100);
    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        documentaryProgress: percent,
        lastActivityAt: new Date(),
      },
    });
  }
}
