import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  CaseRiskLevel,
  Prisma,
  TaskStatus,
  TaskType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.types';
import {
  evaluateTaskSla,
  taskTypeLabel,
  type SlaTone,
} from './sla-engine';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';

const GLOBAL_MANAGERS: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
];

const taskInclude = {
  case: {
    select: {
      id: true,
      internalCode: true,
      fileNumber: true,
      advisorId: true,
      riskLevel: true,
      status: true,
      deceased: { select: { fullName: true, documentNumber: true } },
    },
  },
  assignee: {
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private isManager(role: UserRole): boolean {
    return GLOBAL_MANAGERS.includes(role);
  }

  private isAdvisor(role: UserRole): boolean {
    return role === UserRole.ASESOR;
  }

  private assertCaseAccess(
    advisorId: string | null | undefined,
    user: AuthUser,
  ): void {
    if (this.isManager(user.role)) return;
    if (advisorId !== user.id) {
      throw new ForbiddenException(
        'No tiene permiso sobre tareas de este caso',
      );
    }
  }

  /**
   * Valida a quién puede asignar el usuario según RBAC de delegación cruzada.
   * ASESOR → solo sí mismo o SUPER_ADMIN.
   * Managers → cualquier usuario activo (prioriza asesor del caso en UI).
   */
  private async assertAssigneeAllowed(
    user: AuthUser,
    caso: { advisorId: string | null },
    assigneeId: string,
  ): Promise<void> {
    const assignee = await this.prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true, role: true, status: true, firstName: true, lastName: true },
    });
    if (!assignee || assignee.status !== 'ACTIVE') {
      throw new BadRequestException('Usuario asignado no encontrado o inactivo');
    }

    if (this.isAdvisor(user.role)) {
      const ok =
        assignee.id === user.id || assignee.role === UserRole.SUPER_ADMIN;
      if (!ok) {
        throw new ForbiddenException(
          'Un asesor solo puede autoasignarse o escalar a un SUPER_ADMIN',
        );
      }
      return;
    }

    if (this.isManager(user.role)) {
      return; // puede asignar a cualquiera del equipo
    }

    throw new ForbiddenException('Rol no autorizado para asignar tareas');
  }

  private resolveDefaultAssignee(
    user: AuthUser,
    caso: { advisorId: string | null },
    requested?: string,
  ): string {
    if (requested) return requested;
    if (this.isAdvisor(user.role)) return user.id;
    return caso.advisorId ?? user.id;
  }

  private withSla<T extends { status: string; dueDate: Date | null }>(task: T) {
    const sla = evaluateTaskSla(task);
    return {
      ...task,
      sla,
      taskTypeLabel: taskTypeLabel(
        (task as { taskType?: string }).taskType,
      ),
    };
  }

  /** Si hay tarea ROJA abierta, eleva el semáforo del caso a HIGH */
  private async propagateCaseRisk(caseId: string) {
    const open = await this.prisma.task.findMany({
      where: {
        caseId,
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.OVERDUE] },
      },
      select: { status: true, dueDate: true },
    });

    const hasRed = open.some((t) => evaluateTaskSla(t).tone === 'red');
    if (!hasRed) return;

    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        riskLevel: CaseRiskLevel.HIGH,
        lastActivityAt: new Date(),
      },
    });
  }

  async list(query: ListTasksQueryDto, user: AuthUser) {
    const pageSize = query.pageSize ?? 100;

    if (!query.caseId && !this.isManager(user.role)) {
      // Asesor: casos propios O tareas asignadas a él
      const where: Prisma.TaskWhereInput = {
        AND: [
          {
            OR: [
              { case: { advisorId: user.id } },
              { assigneeId: user.id },
            ],
          },
          ...(query.status ? [{ status: query.status }] : []),
          ...(query.taskType ? [{ taskType: query.taskType }] : []),
          ...(query.assigneeId ? [{ assigneeId: query.assigneeId }] : []),
        ],
      };

      const items = await this.prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: pageSize,
      });

      let mapped = items.map((t) => this.withSla(t));
      if (query.sla) {
        const tone = query.sla.toLowerCase() as SlaTone;
        mapped = mapped.filter((t) => t.sla.tone === tone);
      }
      return mapped;
    }

    if (query.caseId) {
      const caso = await this.prisma.case.findUnique({
        where: { id: query.caseId },
        select: { advisorId: true },
      });
      if (!caso) throw new NotFoundException('Caso no encontrado');
      this.assertCaseAccess(caso.advisorId, user);
    }

    const where: Prisma.TaskWhereInput = {
      ...(query.caseId ? { caseId: query.caseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.taskType ? { taskType: query.taskType } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(!this.isManager(user.role) && !query.caseId
        ? {
            OR: [
              { case: { advisorId: user.id } },
              { assigneeId: user.id },
            ],
          }
        : {}),
    };

    const items = await this.prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: pageSize,
    });

    let mapped = items.map((t) => this.withSla(t));
    if (query.sla) {
      const tone = query.sla.toLowerCase() as SlaTone;
      mapped = mapped.filter((t) => t.sla.tone === tone);
    }
    return mapped;
  }

  async create(dto: CreateTaskDto, user: AuthUser, ip?: string | null) {
    if (!dto.caseId?.trim()) {
      throw new BadRequestException(
        'Toda tarea debe estar vinculada a un caso (caseId obligatorio)',
      );
    }

    const caso = await this.prisma.case.findUnique({
      where: { id: dto.caseId },
      select: {
        id: true,
        advisorId: true,
        internalCode: true,
        status: true,
        advisor: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
      },
    });
    if (!caso) throw new NotFoundException('Caso no encontrado');

    // Escenario ASESOR: solo en casos donde es el asesor asignado
    if (this.isAdvisor(user.role)) {
      if (caso.advisorId !== user.id) {
        throw new ForbiddenException(
          'Solo puede crear tareas en casos donde usted es el asesor asignado',
        );
      }
    } else if (!this.isManager(user.role)) {
      throw new ForbiddenException('No tiene permiso para crear tareas');
    }

    // Managers: solo casos activos del sistema (no archivados/cerrados)
    if (
      this.isManager(user.role) &&
      (caso.status === 'ARCHIVED' || caso.status === 'CLOSED')
    ) {
      throw new BadRequestException(
        'Solo puede crear tareas en casos activos del sistema',
      );
    }

    const taskType = dto.taskType ?? TaskType.OTRO;
    const title = dto.title?.trim() || taskTypeLabel(taskType);

    const assigneeId = this.resolveDefaultAssignee(
      user,
      caso,
      dto.assigneeId,
    );
    await this.assertAssigneeAllowed(user, caso, assigneeId);

    const task = await this.prisma.task.create({
      data: {
        caseId: caso.id,
        title,
        description: dto.description?.trim(),
        taskType,
        priority: dto.priority ?? 'MEDIUM',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assigneeId,
        createdById: user.id,
      },
      include: taskInclude,
    });

    await this.prisma.case.update({
      where: { id: caso.id },
      data: { lastActivityAt: new Date() },
    });

    await this.propagateCaseRisk(caso.id);

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: AuditAction.TAREA_CREADA,
      entidadAfectada: AuditEntity.TAREA,
      entidadId: task.id,
      caseId: caso.id,
      newData: {
        title: task.title,
        description: task.description,
        taskType: task.taskType,
        priority: task.priority,
        dueDate: task.dueDate,
        casoId: caso.id,
        caseCode: caso.internalCode,
        creadoPorId: user.id,
        creadoPor: `${user.firstName} ${user.lastName}`,
        asignadoAId: assigneeId,
        asignadoA: task.assignee
          ? `${task.assignee.firstName} ${task.assignee.lastName}`
          : null,
      },
      ipAddress: ip,
    });

    return this.withSla(task);
  }

  /**
   * Lista de usuarios permitidos en el combobox "Asignar a"
   * según el rol de quien crea la tarea y el caso.
   */
  async assignableUsers(caseId: string, user: AuthUser) {
    const caso = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        advisorId: true,
        advisor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            status: true,
          },
        },
      },
    });
    if (!caso) throw new NotFoundException('Caso no encontrado');

    if (this.isAdvisor(user.role)) {
      if (caso.advisorId !== user.id) {
        throw new ForbiddenException(
          'Solo puede asignar tareas en sus propios casos',
        );
      }
      const me = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          status: true,
        },
      });
      const admins = await this.prisma.user.findMany({
        where: { role: UserRole.SUPER_ADMIN, status: 'ACTIVE' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          status: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
      const list = [
        ...(me ? [{ ...me, suggested: true as const, tag: 'Yo (autoasignación)' }] : []),
        ...admins
          .filter((a) => a.id !== user.id)
          .map((a) => ({
            ...a,
            suggested: false as const,
            tag: 'SUPER_ADMIN · Escalamiento',
          })),
      ];
      return {
        mode: 'ASESOR' as const,
        defaultAssigneeId: user.id,
        creator: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        users: list,
      };
    }

    if (!this.isManager(user.role)) {
      throw new ForbiddenException('No autorizado');
    }

    const team = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    // Sugerir primero al asesor del caso
    const advisorId = caso.advisorId;
    const sorted = [...team].sort((a, b) => {
      if (a.id === advisorId) return -1;
      if (b.id === advisorId) return 1;
      if (a.id === user.id) return -1;
      if (b.id === user.id) return 1;
      return 0;
    });

    return {
      mode: 'SUPER_ADMIN' as const,
      defaultAssigneeId: advisorId ?? user.id,
      caseAdvisorId: advisorId,
      creator: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      users: sorted.map((u) => ({
        ...u,
        suggested: u.id === advisorId,
        tag:
          u.id === advisorId
            ? 'Asesor del caso'
            : u.id === user.id
              ? 'Yo'
              : u.role,
      })),
    };
  }

  async update(
    id: string,
    dto: UpdateTaskDto,
    user: AuthUser,
    ip?: string | null,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { case: { select: { advisorId: true, internalCode: true } } },
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    const isAssignee = task.assigneeId === user.id;
    if (!this.isManager(user.role) && !isAssignee) {
      this.assertCaseAccess(task.case?.advisorId, user);
    }

    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      await this.assertAssigneeAllowed(
        user,
        { advisorId: task.case?.advisorId ?? null },
        dto.assigneeId,
      );
    } else if (dto.assigneeId === null && this.isAdvisor(user.role)) {
      throw new BadRequestException('Debe indicar un responsable válido');
    }

    const status = dto.status;
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description,
        taskType: dto.taskType,
        status,
        priority: dto.priority,
        assigneeId:
          dto.assigneeId === undefined ? undefined : dto.assigneeId,
        dueDate:
          dto.dueDate === undefined
            ? undefined
            : dto.dueDate
              ? new Date(dto.dueDate)
              : null,
        completedAt:
          status === TaskStatus.COMPLETED ? new Date() : undefined,
        startedAt:
          status === TaskStatus.IN_PROGRESS ? new Date() : undefined,
      },
      include: taskInclude,
    });

    await this.propagateCaseRisk(task.caseId);

    const completedNow =
      status === TaskStatus.COMPLETED && task.status !== TaskStatus.COMPLETED;

    this.audit.registrarAuditoria({
      usuarioId: user.id,
      accion: completedNow
        ? AuditAction.TAREA_COMPLETADA
        : AuditAction.TAREA_ACTUALIZADA,
      entidadAfectada: AuditEntity.TAREA,
      entidadId: id,
      caseId: task.caseId,
      prevData: {
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        taskType: task.taskType,
      },
      newData: {
        title: updated.title,
        status: updated.status,
        priority: updated.priority,
        dueDate: updated.dueDate,
        taskType: updated.taskType,
        caseCode: task.case?.internalCode,
        patch: dto,
      },
      ipAddress: ip,
    });

    return this.withSla(updated);
  }

  meta() {
    return {
      taskTypes: Object.values(TaskType).map((value) => ({
        value,
        label: taskTypeLabel(value),
      })),
      statuses: Object.values(TaskStatus),
    };
  }
}
