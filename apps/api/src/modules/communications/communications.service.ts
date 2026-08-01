import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  EstadoEnvioCorreo,
  UserRole,
} from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import {
  MailerService,
  type MailAttachment,
} from '../../infrastructure/mailer/mailer.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.types';
import { SendCaseEmailDto } from './dto/communications.dto';

const MANAGERS: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
];

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
  ) {}

  private assertCaseAccess(
    advisorId: string | null | undefined,
    user: AuthUser,
  ): void {
    if (MANAGERS.includes(user.role)) return;
    if (advisorId !== user.id) {
      throw new ForbiddenException('No tiene acceso a este caso');
    }
  }

  meta(user: AuthUser) {
    return {
      sender: this.mailer.resolveSender(user.email),
      senders: this.mailer.listSenders(),
    };
  }

  async recipients(caseId: string, user: AuthUser) {
    const caso = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        advisorId: true,
        relatives: {
          select: {
            id: true,
            fullName: true,
            email: true,
            kinship: true,
          },
          orderBy: { fullName: 'asc' },
        },
      },
    });
    if (!caso) throw new NotFoundException('Caso no encontrado');
    this.assertCaseAccess(caso.advisorId, user);

    return caso.relatives
      .filter((r) => !!r.email?.trim())
      .map((r) => ({
        id: r.id,
        label: `${r.fullName} (${r.kinship})`,
        email: r.email!.trim(),
      }));
  }

  async caseAttachments(caseId: string, user: AuthUser) {
    const caso = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { advisorId: true },
    });
    if (!caso) throw new NotFoundException('Caso no encontrado');
    this.assertCaseAccess(caso.advisorId, user);

    const docs = await this.prisma.document.findMany({
      where: {
        caseId,
        OR: [
          { storageKey: { not: null } },
          { storageUrl: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        category: true,
        status: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        storageKey: true,
      },
      orderBy: { name: 'asc' },
    });

    return docs
      .filter((d) => !!d.storageKey)
      .map((d) => ({
        id: d.id,
        name: d.originalFileName || d.name,
        category: d.category,
        status: d.status,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
      }));
  }

  private async loadAttachment(
    storageKey: string,
    filename: string,
    mimeType?: string | null,
  ): Promise<MailAttachment> {
    const abs = this.storage.resolveAbsolute(storageKey);
    if (!existsSync(abs)) {
      throw new BadRequestException(`Archivo no encontrado: ${filename}`);
    }
    const content = await readFile(abs);
    return {
      filename,
      content,
      contentType: mimeType ?? undefined,
    };
  }

  async sendCaseEmail(
    caseId: string,
    dto: SendCaseEmailDto,
    user: AuthUser,
    ip?: string | null,
  ) {
    const caso = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        advisorId: true,
        internalCode: true,
        deceased: { select: { fullName: true } },
      },
    });
    if (!caso) throw new NotFoundException('Caso no encontrado');
    this.assertCaseAccess(caso.advisorId, user);

    const caseDocIds = dto.caseDocumentIds ?? [];
    const repoDocIds = dto.repoDocumentIds ?? [];

    const attachments: MailAttachment[] = [];
    const attachedNames: string[] = [];

    if (caseDocIds.length) {
      const docs = await this.prisma.document.findMany({
        where: { id: { in: caseDocIds }, caseId },
      });
      if (docs.length !== caseDocIds.length) {
        throw new BadRequestException('Documento del caso inválido');
      }
      for (const d of docs) {
        if (!d.storageKey) {
          throw new BadRequestException(`Sin archivo físico: ${d.name}`);
        }
        const name = d.originalFileName || `${d.name}.pdf`;
        attachments.push(
          await this.loadAttachment(d.storageKey, name, d.mimeType),
        );
        attachedNames.push(name);
      }
    }

    if (repoDocIds.length) {
      const repos = await this.prisma.repositorioCorporativo.findMany({
        where: { id: { in: repoDocIds }, activo: true },
      });
      if (repos.length !== repoDocIds.length) {
        throw new BadRequestException('Documento corporativo inválido');
      }
      for (const r of repos) {
        if (!r.storageKey) {
          throw new BadRequestException(`Sin archivo físico: ${r.nombre}`);
        }
        const name = r.nombre.endsWith('.pdf') ? r.nombre : `${r.nombre}.pdf`;
        attachments.push(
          await this.loadAttachment(r.storageKey, name, r.mimeType),
        );
        attachedNames.push(name);
      }
    }

    const from = this.mailer.resolveSender(user.email);
    const result = await this.mailer.send({
      from,
      to: dto.to.trim(),
      subject: dto.subject.trim(),
      text: dto.message.trim(),
      attachments,
    });

    const estado = result.ok
      ? EstadoEnvioCorreo.DELIVERED
      : EstadoEnvioCorreo.FAILED;

    const log = await this.prisma.registroEnvioCorreo.create({
      data: {
        casoId: caseId,
        remitenteId: user.id,
        destinatarioEmail: dto.to.trim(),
        asunto: dto.subject.trim(),
        mensaje: dto.message.trim(),
        documentosAdjuntos: attachedNames,
        estadoEnvio: estado,
        errorMessage: result.error ?? null,
      },
    });

    await this.prisma.caseActivity.create({
      data: {
        caseId,
        userId: user.id,
        type: ActivityType.EMAIL,
        title: result.ok
          ? `Correo enviado a ${dto.to.trim()}`
          : `Fallo al enviar correo a ${dto.to.trim()}`,
        description: `Se envió correo a ${dto.to.trim()} con ${attachedNames.length} adjunto(s). Remitente: ${from}.`,
        metadata: {
          emailLogId: log.id,
          attachments: attachedNames,
          estado,
          simulated: result.simulated ?? false,
        },
      },
    });

    await this.prisma.case.update({
      where: { id: caseId },
      data: { lastActivityAt: new Date() },
    });

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.CORREO_ENVIADO,
      entidadAfectada: AuditEntity.CASO,
      entidadId: caseId,
      caseId,
      newData: {
        to: dto.to,
        from,
        subject: dto.subject,
        attachments: attachedNames,
        estado,
        caseCode: caso.internalCode,
        emailLogId: log.id,
      },
      ipAddress: ip,
    });

    if (!result.ok) {
      throw new BadRequestException(
        result.error ?? 'No se pudo enviar el correo',
      );
    }

    return {
      ok: true,
      logId: log.id,
      from,
      to: dto.to.trim(),
      attachments: attachedNames,
      simulated: result.simulated ?? false,
      message: result.simulated
        ? 'Correo registrado en modo simulado (configure SMTP_HOST para envío real)'
        : 'Correo enviado correctamente',
    };
  }
}
