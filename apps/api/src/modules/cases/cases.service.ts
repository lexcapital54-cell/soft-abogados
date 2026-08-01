import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, CaseStage, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { buildCaseFolderPath } from '../../common/utils/sanitize-folder-name';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.types';
import {
  CreateCaseActivityDto,
  CreateCaseDto,
  ListCasesQueryDto,
  UpdateCaseDto,
} from './dto/case.dto';

/** Roles con visión global de la cartera */
const GLOBAL_CASE_VIEWERS: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
];

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private isGlobalViewer(role: UserRole): boolean {
    return GLOBAL_CASE_VIEWERS.includes(role);
  }

  private assertCaseAccess(
    advisorId: string | null | undefined,
    user: AuthUser,
  ): void {
    if (this.isGlobalViewer(user.role)) return;
    if (advisorId !== user.id) {
      throw new ForbiddenException(
        'No tiene permiso sobre este caso (no está asignado a usted)',
      );
    }
  }

  private async nextInternalCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.case.count({
      where: {
        createdAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
        },
      },
    });
    return `LC-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async findAll(query: ListCasesQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const scopedAdvisorId = this.isGlobalViewer(user.role)
      ? query.advisorId
      : user.id;

    const where: Prisma.CaseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(scopedAdvisorId ? { advisorId: scopedAdvisorId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                internalCode: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                fileNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                deceased: {
                  fullName: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                deceased: {
                  documentNumber: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.case.count({ where }),
      this.prisma.case.findMany({
        where,
        include: {
          deceased: {
            select: {
              id: true,
              fullName: true,
              documentNumber: true,
            },
          },
          advisor: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: { select: { relatives: true, documents: true, tasks: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async findOne(id: string, user: AuthUser) {
    const row = await this.getByIdOrThrow(id);
    this.assertCaseAccess(row.advisorId, user);
    return row;
  }

  private async getByIdOrThrow(id: string) {
    const row = await this.prisma.case.findUnique({
      where: { id },
      include: {
        deceased: true,
        advisor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        coordinator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        relatives: { orderBy: { createdAt: 'asc' } },
        tasks: {
          where: { status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] } },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
          take: 20,
        },
        financialProducts: { include: { entity: true } },
        stageHistory: { orderBy: { createdAt: 'desc' }, take: 20 },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Caso no encontrado');
    }
    return row;
  }

  async create(dto: CreateCaseDto, userId: string, ip?: string | null) {
    const deceased = await this.prisma.deceased.findUnique({
      where: { id: dto.deceasedId },
    });
    if (!deceased) {
      throw new NotFoundException('Fallecido no encontrado');
    }

    const internalCode = dto.internalCode ?? (await this.nextInternalCode());
    const fileNumber = dto.fileNumber ?? deceased.documentNumber;
    const stage = dto.stage ?? CaseStage.RECEPCION;
    const feesPercent = dto.feesPercent ?? 30;
    const recoverable = dto.recoverableValue ?? 0;
    const estimatedFees =
      dto.estimatedFees ?? Math.round((recoverable * feesPercent) / 100);
    const storageFolderPath = buildCaseFolderPath(
      deceased.documentNumber,
      deceased.fullName,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.case.create({
        data: {
          internalCode,
          fileNumber,
          deceasedId: dto.deceasedId,
          status: dto.status,
          stage,
          priority: dto.priority,
          riskLevel: dto.riskLevel,
          recoverableValue: recoverable,
          feesPercent,
          estimatedFees,
          city: dto.city ?? deceased.city,
          department: dto.department ?? deceased.department,
          observations: dto.observations,
          advisorId: dto.advisorId ?? userId,
          coordinatorId: dto.coordinatorId,
          storageFolderPath,
          lastActivityAt: new Date(),
        },
        include: {
          deceased: true,
          advisor: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      await tx.caseStageHistory.create({
        data: {
          caseId: row.id,
          toStage: stage,
          changedById: userId,
          notes: 'Caso creado',
        },
      });

      await tx.caseActivity.create({
        data: {
          caseId: row.id,
          userId,
          type: 'SYSTEM',
          title: 'Caso creado',
          description: `Expediente ${internalCode} creado`,
        },
      });

      return row;
    });

    this.audit.registrarAuditoria({
      usuarioId: userId,
      accion: AuditAction.CASO_CREADO,
      entidadAfectada: AuditEntity.CASO,
      entidadId: created.id,
      caseId: created.id,
      newData: {
        internalCode: created.internalCode,
        fileNumber: created.fileNumber,
        deceasedId: created.deceasedId,
        recoverableValue: Number(created.recoverableValue),
        feesPercent: Number(created.feesPercent),
        advisorId: created.advisorId,
        stage: created.stage,
      },
      ipAddress: ip,
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateCaseDto,
    user: AuthUser,
    ip?: string | null,
  ) {
    const current = await this.getByIdOrThrow(id);
    this.assertCaseAccess(current.advisorId, user);

    // Solo managers pueden reasignar
    if (
      (dto.advisorId !== undefined || dto.coordinatorId !== undefined) &&
      !this.isGlobalViewer(user.role)
    ) {
      throw new ForbiddenException(
        'Solo Super Admin / Dirección puede reasignar asesores',
      );
    }

    const previousAdvisorId = current.advisorId;
    const nextRecoverable =
      dto.recoverableValue !== undefined
        ? dto.recoverableValue
        : Number(current.recoverableValue);
    const nextFeesPercent =
      dto.feesPercent !== undefined
        ? dto.feesPercent
        : Number(current.feesPercent ?? 30);

    let nextEstimated = dto.estimatedFees;
    if (
      dto.feesPercent !== undefined ||
      (dto.recoverableValue !== undefined && dto.estimatedFees === undefined)
    ) {
      nextEstimated = Math.round((nextRecoverable * nextFeesPercent) / 100);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.case.update({
        where: { id },
        data: {
          status: dto.status,
          stage: dto.stage,
          priority: dto.priority,
          riskLevel: dto.riskLevel,
          recoverableValue: dto.recoverableValue,
          feesPercent: dto.feesPercent,
          estimatedFees: nextEstimated,
          collectedFees: dto.collectedFees,
          city: dto.city,
          department: dto.department,
          observations: dto.observations,
          strategicNotes: dto.strategicNotes,
          ...(dto.advisorId !== undefined ? { advisorId: dto.advisorId } : {}),
          ...(dto.coordinatorId !== undefined
            ? { coordinatorId: dto.coordinatorId }
            : {}),
          lastActivityAt: new Date(),
        },
        include: {
          deceased: true,
          advisor: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      if (dto.stage && dto.stage !== current.stage) {
        await tx.caseStageHistory.create({
          data: {
            caseId: id,
            fromStage: current.stage,
            toStage: dto.stage,
            changedById: user.id,
          },
        });
        await tx.caseActivity.create({
          data: {
            caseId: id,
            userId: user.id,
            type: 'STATUS_CHANGE',
            title: 'Cambio de etapa',
            description: `${current.stage} → ${dto.stage}`,
          },
        });
      }

      if (
        dto.feesPercent !== undefined &&
        Number(dto.feesPercent) !== Number(current.feesPercent ?? 30)
      ) {
        await tx.caseActivity.create({
          data: {
            caseId: id,
            userId: user.id,
            type: ActivityType.SYSTEM,
            title: 'Honorarios actualizados',
            description: `${current.feesPercent ?? 30}% → ${dto.feesPercent}%`,
          },
        });
      }

      if (
        dto.advisorId !== undefined &&
        dto.advisorId !== previousAdvisorId
      ) {
        await tx.caseActivity.create({
          data: {
            caseId: id,
            userId: user.id,
            type: 'ASSIGNMENT',
            title: dto.advisorId ? 'Asesor asignado' : 'Asesor removido',
            description: dto.advisorId
              ? `Nuevo asesor: ${dto.advisorId}`
              : 'Se quitó el asesor del caso',
          },
        });
      }

      return row;
    });

    const baseCtx = {
      usuarioId: user.id,
      entidadAfectada: AuditEntity.CASO,
      entidadId: id,
      caseId: id,
      ipAddress: ip,
    };

    if (
      dto.feesPercent !== undefined &&
      Number(dto.feesPercent) !== Number(current.feesPercent ?? 30)
    ) {
      this.audit.registrarAuditoria({
        ...baseCtx,
        accion: AuditAction.CAMBIO_HONORARIOS,
        prevData: {
          feesPercent: Number(current.feesPercent ?? 30),
          estimatedFees: Number(current.estimatedFees),
        },
        newData: {
          feesPercent: Number(dto.feesPercent),
          estimatedFees: Number(updated.estimatedFees),
        },
      });
    }

    if (dto.stage && dto.stage !== current.stage) {
      this.audit.registrarAuditoria({
        ...baseCtx,
        accion: AuditAction.CAMBIO_ETAPA,
        prevData: { stage: current.stage },
        newData: { stage: dto.stage },
      });

      const legalStages: CaseStage[] = [
        CaseStage.DEMANDA,
        CaseStage.PROCESO_JUDICIAL,
      ];
      if (legalStages.includes(dto.stage)) {
        this.audit.registrarAuditoria({
          ...baseCtx,
          accion: AuditAction.TRASLADO_AREA_JURIDICA,
          prevData: { stage: current.stage },
          newData: { stage: dto.stage },
        });
      }
    }

    if (
      dto.advisorId !== undefined &&
      dto.advisorId !== previousAdvisorId
    ) {
      this.audit.registrarAuditoria({
        ...baseCtx,
        accion: AuditAction.CASO_REASIGNADO,
        prevData: { advisorId: previousAdvisorId },
        newData: { advisorId: dto.advisorId },
      });
    }

    if (
      dto.strategicNotes !== undefined &&
      dto.strategicNotes !== current.strategicNotes
    ) {
      this.audit.registrarAuditoria({
        ...baseCtx,
        accion: AuditAction.NOTA_ESTRATEGICA,
        prevData: { strategicNotes: current.strategicNotes },
        newData: { strategicNotes: dto.strategicNotes },
      });
    }

    this.audit.registrarAuditoria({
      ...baseCtx,
      accion: AuditAction.CASO_ACTUALIZADO,
      prevData: {
        status: current.status,
        stage: current.stage,
        recoverableValue: Number(current.recoverableValue),
        feesPercent: Number(current.feesPercent ?? 30),
        collectedFees: Number(current.collectedFees),
      },
      newData: {
        status: updated.status,
        stage: updated.stage,
        recoverableValue: Number(updated.recoverableValue),
        feesPercent: Number(updated.feesPercent),
        collectedFees: Number(updated.collectedFees),
        patch: dto,
      },
    });

    return updated;
  }

  async addActivity(
    caseId: string,
    dto: CreateCaseActivityDto,
    user: AuthUser,
    ip?: string | null,
  ) {
    const caso = await this.getByIdOrThrow(caseId);
    this.assertCaseAccess(caso.advisorId, user);

    const createCommitment = !!dto.createCommitment;
    if (createCommitment) {
      if (!dto.commitmentTitle?.trim()) {
        throw new BadRequestException(
          'Indique el título del compromiso',
        );
      }
      if (!dto.commitmentDueAt) {
        throw new BadRequestException(
          'Indique la fecha del compromiso',
        );
      }
    }

    const type = createCommitment
      ? ActivityType.PROMISE
      : (dto.type ?? ActivityType.COMMENT);

    const title = createCommitment
      ? `Compromiso: ${dto.commitmentTitle!.trim()}`
      : 'Acción de gestión';

    const activity = await this.prisma.$transaction(async (tx) => {
      const row = await tx.caseActivity.create({
        data: {
          caseId,
          userId: user.id,
          type,
          title,
          description: dto.description.trim(),
          metadata: createCommitment
            ? {
                dueAt: dto.commitmentDueAt,
                commitmentTitle: dto.commitmentTitle!.trim(),
                isCommitment: true,
              }
            : undefined,
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      if (createCommitment && dto.commitmentDueAt) {
        await tx.task.create({
          data: {
            caseId,
            title: dto.commitmentTitle!.trim(),
            description: dto.description.trim(),
            dueDate: new Date(dto.commitmentDueAt),
            priority: 'HIGH',
            assigneeId: caso.advisorId ?? user.id,
            createdById: user.id,
          },
        });
      }

      await tx.case.update({
        where: { id: caseId },
        data: { lastActivityAt: new Date() },
      });

      return row;
    });

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.ACTIVIDAD_REGISTRADA,
      entidadAfectada: AuditEntity.ACTIVIDAD,
      entidadId: activity.id,
      caseId,
      newData: {
        type: activity.type,
        title: activity.title,
        description: activity.description,
        createCommitment,
      },
      ipAddress: ip,
    });

    return activity;
  }

  async assign(
    id: string,
    dto: { advisorId?: string | null; coordinatorId?: string | null },
    user: AuthUser,
    ip?: string | null,
  ) {
    if (!this.isGlobalViewer(user.role)) {
      throw new ForbiddenException(
        'Solo Super Admin / Dirección puede asignar casos',
      );
    }
    return this.update(
      id,
      {
        advisorId: dto.advisorId,
        coordinatorId: dto.coordinatorId,
      },
      user,
      ip,
    );
  }

  async remove(id: string, user: AuthUser, ip?: string | null) {
    if (!this.isGlobalViewer(user.role)) {
      throw new ForbiddenException(
        'Solo Super Admin / Dirección puede eliminar casos',
      );
    }
    const current = await this.getByIdOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.caseActivity.create({
        data: {
          caseId: id,
          userId: user.id,
          type: 'SYSTEM',
          title: 'Caso eliminado',
          description: `Eliminado por usuario ${user.id}`,
        },
      });
      await tx.case.delete({ where: { id } });
    });

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.CASO_ELIMINADO,
      entidadAfectada: AuditEntity.CASO,
      entidadId: id,
      caseId: id,
      prevData: {
        internalCode: current.internalCode,
        stage: current.stage,
        status: current.status,
        advisorId: current.advisorId,
        recoverableValue: Number(current.recoverableValue),
        feesPercent: Number(current.feesPercent ?? 30),
      },
      newData: { deleted: true },
      ipAddress: ip,
    });

    return { ok: true, id };
  }
}
