import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TaskStatus, UserRole } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.types';
import { evaluateTaskSla } from '../tasks/sla-engine';
import { listNonWorkingDays } from './colombia-holidays';
import {
  CalendarEventsQueryDto,
  CalendarMoveDto,
} from './dto/calendar.dto';

const TZ = 'America/Bogota';

const MANAGERS: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
];

const OPEN: TaskStatus[] = [
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
  TaskStatus.OVERDUE,
];

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private isManager(role: UserRole): boolean {
    return MANAGERS.includes(role);
  }

  private bogotaDateKey(d: Date): string {
    return formatInTimeZone(d, TZ, 'yyyy-MM-dd');
  }

  async resources(user: AuthUser) {
    if (!this.isManager(user.role)) {
      throw new ForbiddenException('Solo dirección puede listar recursos');
    }
    const advisors = await this.prisma.user.findMany({
      where: { role: UserRole.ASESOR, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return advisors.map((a) => ({
      id: a.id,
      title: `${a.firstName} ${a.lastName}`,
      email: a.email,
    }));
  }

  async events(user: AuthUser, query: CalendarEventsQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }

    let assigneeFilter: string[] | null = null;

    if (!this.isManager(user.role)) {
      if (user.role !== UserRole.ASESOR) {
        throw new ForbiddenException('No autorizado');
      }
      assigneeFilter = [user.id];
    } else if (query.advisorIds?.trim()) {
      assigneeFilter = query.advisorIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        dueDate: { gte: from, lte: to },
        status: { in: [...OPEN, TaskStatus.COMPLETED] },
        ...(assigneeFilter
          ? { assigneeId: { in: assigneeFilter } }
          : {}),
      },
      include: {
        case: {
          select: {
            id: true,
            internalCode: true,
            deceased: { select: { fullName: true } },
          },
        },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: 2000,
    });

    const nonWorkingDays = listNonWorkingDays(from, to);

    const events = tasks
      .filter((t) => t.dueDate)
      .map((t) => {
        const sla = evaluateTaskSla(t);
        const due = t.dueDate!;
        const dateKey = this.bogotaDateKey(due);
        const initials = t.assignee
          ? `${t.assignee.firstName[0] ?? ''}${t.assignee.lastName[0] ?? ''}`.toUpperCase()
          : '?';
        return {
          id: t.id,
          title: t.title,
          start: due.toISOString(),
          end: due.toISOString(),
          allDay: true,
          dateKey,
          caseId: t.caseId,
          caseCode: t.case?.internalCode ?? null,
          deceasedName: t.case?.deceased?.fullName ?? null,
          status: t.status,
          taskType: t.taskType,
          description: t.description,
          assigneeId: t.assigneeId,
          assigneeName: t.assignee
            ? `${t.assignee.firstName} ${t.assignee.lastName}`
            : 'Sin asignar',
          assigneeInitials: initials,
          createdByName: t.createdBy
            ? `${t.createdBy.firstName} ${t.createdBy.lastName}`
            : null,
          slaTone: sla.tone,
          slaLabel: sla.label,
          resourceId: t.assigneeId,
          backgroundColor:
            sla.tone === 'red'
              ? '#f43f5e'
              : sla.tone === 'yellow'
                ? '#f59e0b'
                : '#10b981',
          borderColor:
            sla.tone === 'red'
              ? '#be123c'
              : sla.tone === 'yellow'
                ? '#b45309'
                : '#047857',
          textColor: '#fff',
        };
      });

    return {
      timezone: TZ,
      mode: this.isManager(user.role) ? ('GLOBAL' as const) : ('ASESOR' as const),
      range: { from: from.toISOString(), to: to.toISOString() },
      nonWorkingDays,
      events,
    };
  }

  /**
   * Reasignación / reprogramación desde calendario (DnD o sheet).
   * Audita cada movimiento del Super Admin / managers.
   */
  async move(
    id: string,
    dto: CalendarMoveDto,
    user: AuthUser,
    ip?: string | null,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        case: { select: { id: true, internalCode: true, advisorId: true } },
        assignee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    if (!this.isManager(user.role)) {
      // Asesor: solo puede mover fecha de sus propias tareas (no reasignar a otros)
      if (task.assigneeId !== user.id) {
        throw new ForbiddenException('Solo puede modificar sus propias tareas');
      }
      if (dto.assigneeId && dto.assigneeId !== user.id) {
        throw new ForbiddenException(
          'Un asesor no puede reasignar tareas a otros asesores',
        );
      }
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: dto.assigneeId },
        select: { id: true, status: true, role: true },
      });
      if (!assignee || assignee.status !== 'ACTIVE') {
        throw new BadRequestException('Responsable inválido');
      }
      if (
        user.role === UserRole.ASESOR &&
        assignee.id !== user.id &&
        assignee.role !== UserRole.SUPER_ADMIN
      ) {
        throw new ForbiddenException(
          'Solo puede autoasignarse o escalar a SUPER_ADMIN',
        );
      }
    }

    const prev = {
      assigneeId: task.assigneeId,
      dueDate: task.dueDate,
      assigneeName: task.assignee
        ? `${task.assignee.firstName} ${task.assignee.lastName}`
        : null,
    };

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.assigneeId !== undefined
          ? { assigneeId: dto.assigneeId }
          : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
          : {}),
      },
      include: {
        assignee: {
          select: { id: true, firstName: true, lastName: true },
        },
        case: { select: { id: true, internalCode: true } },
      },
    });

    const reassigned =
      dto.assigneeId !== undefined && dto.assigneeId !== prev.assigneeId;
    const rescheduled =
      dto.dueDate !== undefined &&
      (prev.dueDate?.toISOString() ?? null) !==
        (updated.dueDate?.toISOString() ?? null);

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: reassigned
        ? AuditAction.TAREA_REASIGNADA
        : rescheduled
          ? AuditAction.TAREA_REPROGRAMADA
          : AuditAction.TAREA_ACTUALIZADA,
      entidadAfectada: AuditEntity.TAREA,
      entidadId: id,
      caseId: task.caseId,
      prevData: prev,
      newData: {
        assigneeId: updated.assigneeId,
        dueDate: updated.dueDate,
        assigneeName: updated.assignee
          ? `${updated.assignee.firstName} ${updated.assignee.lastName}`
          : null,
        caseCode: task.case?.internalCode,
        creadoPorId: user.id,
        origen: 'calendario',
        timezone: TZ,
      },
      ipAddress: ip,
    });

    const sla = evaluateTaskSla(updated);
    return {
      id: updated.id,
      dueDate: updated.dueDate?.toISOString() ?? null,
      assigneeId: updated.assigneeId,
      assigneeName: updated.assignee
        ? `${updated.assignee.firstName} ${updated.assignee.lastName}`
        : null,
      slaTone: sla.tone,
      caseId: updated.caseId,
    };
  }
}
