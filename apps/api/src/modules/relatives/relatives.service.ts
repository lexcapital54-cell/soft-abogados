import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  ContactStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.types';
import {
  ContactRelativeDto,
  CreateRelativeDto,
  RescheduleRelativeSlaDto,
  UpdateRelativeDto,
} from './dto/relative.dto';

const GLOBAL_MANAGERS: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
];

@Injectable()
export class RelativesService {
  constructor(
    private readonly prisma: PrismaService,
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
        'No tiene permiso sobre familiares de este caso',
      );
    }
  }

  private async getCaseOrThrow(caseId: string) {
    const caso = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        advisorId: true,
        deceasedId: true,
        internalCode: true,
      },
    });
    if (!caso) throw new NotFoundException('Caso no encontrado');
    return caso;
  }

  findAll(deceasedId: string | undefined, caseId: string | undefined, user: AuthUser) {
    // Sin filtro de caso/fallecido no listamos cartera global a asesores
    if (!deceasedId && !caseId && !this.isManager(user.role)) {
      throw new ForbiddenException('Indique caseId para listar familiares');
    }
    return this.prisma.relative.findMany({
      where: {
        ...(deceasedId ? { deceasedId } : {}),
        ...(caseId ? { caseId } : {}),
        ...(!this.isManager(user.role)
          ? { case: { advisorId: user.id } }
          : {}),
      },
      include: {
        deceased: {
          select: { id: true, fullName: true, documentNumber: true },
        },
        case: { select: { id: true, internalCode: true, advisorId: true } },
        advisor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthUser) {
    const row = await this.prisma.relative.findUnique({
      where: { id },
      include: {
        deceased: true,
        case: { select: { id: true, advisorId: true, internalCode: true } },
        documents: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Familiar no encontrado');
    }
    this.assertCaseAccess(row.case?.advisorId, user);
    return row;
  }

  async create(dto: CreateRelativeDto, user: AuthUser, ip?: string | null) {
    const caso = await this.getCaseOrThrow(dto.caseId);
    this.assertCaseAccess(caso.advisorId, user);

    const deceasedId = dto.deceasedId ?? caso.deceasedId;
    const deceased = await this.prisma.deceased.findUnique({
      where: { id: deceasedId },
    });
    if (!deceased) {
      throw new NotFoundException('Fallecido no encontrado');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const relative = await tx.relative.create({
        data: {
          deceasedId,
          caseId: caso.id,
          fullName: dto.fullName.trim(),
          kinship: dto.kinship,
          documentType: dto.documentType ?? 'CC',
          documentNumber: dto.documentNumber?.trim() || null,
          address: dto.address,
          city: dto.city,
          department: dto.department,
          phone: dto.phone,
          mobile: dto.mobile,
          whatsapp: dto.whatsapp,
          email: dto.email,
          contactStatus: dto.contactStatus ?? ContactStatus.SIN_CONTACTAR,
          interestLevel: dto.interestLevel,
          observations: dto.observations,
          advisorId: caso.advisorId ?? user.id,
          slaDueAt: dto.slaDueAt ? new Date(dto.slaDueAt) : null,
        },
      });

      await tx.caseActivity.create({
        data: {
          caseId: caso.id,
          userId: user.id,
          type: ActivityType.SYSTEM,
          title: 'Familiar registrado',
          description: `${relative.fullName} (${relative.kinship}) agregado al expediente`,
          metadata: { relativeId: relative.id },
        },
      });

      await tx.case.update({
        where: { id: caso.id },
        data: { lastActivityAt: new Date() },
      });

      return relative;
    });

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.HEREDERO_CREADO,
      entidadAfectada: AuditEntity.HEREDERO,
      entidadId: created.id,
      caseId: caso.id,
      newData: {
        fullName: created.fullName,
        kinship: created.kinship,
        contactStatus: created.contactStatus,
        documentNumber: created.documentNumber,
      },
      ipAddress: ip,
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateRelativeDto,
    user: AuthUser,
    ip?: string | null,
  ) {
    const current = await this.findOne(id, user);

    const updated = await this.prisma.$transaction(async (tx) => {
      const relative = await tx.relative.update({
        where: { id: current.id },
        data: {
          fullName: dto.fullName?.trim(),
          kinship: dto.kinship,
          documentNumber:
            dto.documentNumber !== undefined
              ? dto.documentNumber.trim() || null
              : undefined,
          address: dto.address,
          city: dto.city,
          department: dto.department,
          phone: dto.phone,
          mobile:
            dto.mobile !== undefined ? dto.mobile.trim() || null : undefined,
          whatsapp: dto.whatsapp,
          email:
            dto.email !== undefined ? dto.email.trim() || null : undefined,
          contactStatus: dto.contactStatus,
          interestLevel: dto.interestLevel,
          observations: dto.observations,
          caseId: dto.caseId,
          advisorId: dto.advisorId,
          slaDueAt:
            dto.slaDueAt === undefined
              ? undefined
              : dto.slaDueAt
                ? new Date(dto.slaDueAt)
                : null,
        },
      });

      if (current.caseId) {
        const wasPlaceholder = /^pendiente(\s+\d+)?$/i.test(
          current.fullName.trim(),
        );
        await tx.caseActivity.create({
          data: {
            caseId: current.caseId,
            userId: user.id,
            type: ActivityType.SYSTEM,
            title: wasPlaceholder
              ? 'Datos de familiar completados'
              : 'Familiar actualizado',
            description: wasPlaceholder
              ? `Placeholder “${current.fullName}” → ${relative.fullName}`
              : `${relative.fullName} (${relative.kinship})`,
            metadata: {
              relativeId: relative.id,
              previousName: current.fullName,
            },
          },
        });

        await tx.case.update({
          where: { id: current.caseId },
          data: { lastActivityAt: new Date() },
        });
      }

      return relative;
    });

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.HEREDERO_ACTUALIZADO,
      entidadAfectada: AuditEntity.HEREDERO,
      entidadId: id,
      caseId: current.caseId,
      prevData: {
        fullName: current.fullName,
        kinship: current.kinship,
        contactStatus: current.contactStatus,
        phone: current.phone,
        mobile: current.mobile,
        email: current.email,
      },
      newData: {
        fullName: updated.fullName,
        kinship: updated.kinship,
        contactStatus: updated.contactStatus,
        phone: updated.phone,
        mobile: updated.mobile,
        email: updated.email,
        patch: dto,
      },
      ipAddress: ip,
    });

    return updated;
  }

  /**
   * Registra contacto: deja nota, pasa a CONTACTADO y crea actividad en el caso.
   */
  async registerContact(
    id: string,
    dto: ContactRelativeDto,
    user: AuthUser,
    ip?: string | null,
  ) {
    const relative = await this.findOne(id, user);
    if (!relative.caseId) {
      throw new NotFoundException('El familiar no está vinculado a un caso');
    }

    const note = dto.note.trim();
    const channel = dto.channel ?? ActivityType.CALL;
    const stamp = new Date().toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const author = `${user.firstName} ${user.lastName}`.trim();
    const entry = `[${stamp}] ${author}: ${note}`;
    const observations = relative.observations
      ? `${relative.observations}\n${entry}`
      : entry;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.relative.update({
        where: { id: relative.id },
        data: {
          contactStatus: ContactStatus.CONTACTADO,
          observations,
        },
      });

      await tx.caseActivity.create({
        data: {
          caseId: relative.caseId!,
          userId: user.id,
          type: channel,
          title: `Contacto: ${relative.fullName}`,
          description: note,
          metadata: {
            relativeId: relative.id,
            previousStatus: relative.contactStatus,
            newStatus: ContactStatus.CONTACTADO,
            channel,
          },
        },
      });

      await tx.case.update({
        where: { id: relative.caseId! },
        data: { lastActivityAt: new Date() },
      });

      return row;
    });

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.HEREDERO_CONTACTADO,
      entidadAfectada: AuditEntity.HEREDERO,
      entidadId: id,
      caseId: relative.caseId,
      prevData: { contactStatus: relative.contactStatus },
      newData: {
        contactStatus: ContactStatus.CONTACTADO,
        note,
        channel,
      },
      ipAddress: ip,
    });

    return updated;
  }

  async rescheduleSla(
    id: string,
    dto: RescheduleRelativeSlaDto,
    user: AuthUser,
    ip?: string | null,
  ) {
    const relative = await this.findOne(id, user);
    if (!relative.caseId) {
      throw new NotFoundException('El familiar no está vinculado a un caso');
    }

    const nextDue = new Date(dto.slaDueAt);
    const previous = relative.slaDueAt;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.relative.update({
        where: { id: relative.id },
        data: { slaDueAt: nextDue },
      });

      await tx.caseActivity.create({
        data: {
          caseId: relative.caseId!,
          userId: user.id,
          type: ActivityType.FOLLOW_UP,
          title: `SLA reagendado: ${relative.fullName}`,
          description: dto.reason.trim(),
          metadata: {
            relativeId: relative.id,
            previousSlaDueAt: previous,
            newSlaDueAt: nextDue.toISOString(),
            reason: dto.reason.trim(),
          },
        },
      });

      await tx.case.update({
        where: { id: relative.caseId! },
        data: { lastActivityAt: new Date() },
      });

      return row;
    });

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.SLA_REAGENDADO,
      entidadAfectada: AuditEntity.HEREDERO,
      entidadId: id,
      caseId: relative.caseId,
      prevData: { slaDueAt: previous },
      newData: {
        slaDueAt: nextDue.toISOString(),
        reason: dto.reason.trim(),
      },
      ipAddress: ip,
    });

    return updated;
  }
}
