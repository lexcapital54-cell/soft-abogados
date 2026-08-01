import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { RegistrarAuditoriaInput } from './audit.types';
import { ListAuditQueryDto } from './dto/audit.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un evento de auditoría de forma no bloqueante.
   * Nunca lanza al caller: el hilo de negocio no falla por auditoría.
   */
  registrarAuditoria(input: RegistrarAuditoriaInput): void {
    void this.persist(input).catch((err: unknown) => {
      this.logger.error(
        `Fallo al persistir auditoría ${input.accion}`,
        err instanceof Error ? err.stack : String(err),
      );
    });
  }

  /** Variante awaitable (tests / flujos que necesiten confirmación) */
  async registrarAuditoriaAsync(input: RegistrarAuditoriaInput) {
    return this.persist(input);
  }

  private persist(input: RegistrarAuditoriaInput) {
    return this.prisma.auditLog.create({
      data: {
        userId: input.usuarioId ?? null,
        action: input.accion,
        entityType: input.entidadAfectada,
        entityId: input.entidadId ?? null,
        caseId: input.caseId ?? null,
        oldValues:
          input.prevData === undefined
            ? undefined
            : (input.prevData as Prisma.InputJsonValue),
        newValues:
          input.newData === undefined
            ? undefined
            : (input.newData as Prisma.InputJsonValue),
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  async findAll(query: ListAuditQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.caseId ? { caseId: query.caseId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: 'insensitive' } },
              { entityType: { contains: query.search, mode: 'insensitive' } },
              { entityId: { contains: query.search, mode: 'insensitive' } },
              { caseId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
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

  async findOne(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }
}
