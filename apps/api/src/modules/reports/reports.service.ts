import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CaseStatus,
  Prisma,
  TaskStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { ReportsQueryDto } from './dto/reports.dto';

const GLOBAL_VIEWERS: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.CEO,
  UserRole.DIRECTOR_JURIDICO,
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private isManager(role: UserRole): boolean {
    return GLOBAL_VIEWERS.includes(role);
  }

  /**
   * Resuelve el alcance del reporte:
   * - ASESOR → siempre su propio id (ignora query)
   * - Manager → opcional advisorId; sin filtro = plataforma completa
   */
  private resolveScope(
    user: AuthUser,
    query: ReportsQueryDto,
  ): { advisorId: string | null; scopeLabel: string } {
    if (!this.isManager(user.role)) {
      if (user.role !== UserRole.ASESOR) {
        throw new ForbiddenException('No autorizado a ver reportes');
      }
      return {
        advisorId: user.id,
        scopeLabel: `${user.firstName} ${user.lastName}`,
      };
    }
    if (query.advisorId) {
      return { advisorId: query.advisorId, scopeLabel: 'asesor filtrado' };
    }
    return { advisorId: null, scopeLabel: 'Plataforma completa' };
  }

  async performance(user: AuthUser, query: ReportsQueryDto) {
    const { advisorId } = this.resolveScope(user, query);
    const now = new Date();

    const caseWhere: Prisma.CaseWhereInput = {
      ...(advisorId ? { advisorId } : {}),
    };
    const taskWhere: Prisma.TaskWhereInput = advisorId
      ? {
          OR: [
            { assigneeId: advisorId },
            { case: { advisorId } },
          ],
        }
      : {};

    const [
      totalCases,
      activeCases,
      recoveredCases,
      closedCases,
      valueAgg,
      collectedAgg,
      completedTasks,
      pendingTasks,
      overdueTasks,
      inProgressTasks,
      advisors,
      recentCases,
      recentTasks,
      scopedAdvisor,
    ] = await Promise.all([
      this.prisma.case.count({ where: caseWhere }),
      this.prisma.case.count({
        where: { ...caseWhere, status: CaseStatus.ACTIVE },
      }),
      this.prisma.case.count({
        where: { ...caseWhere, status: CaseStatus.RECOVERED },
      }),
      this.prisma.case.count({
        where: {
          ...caseWhere,
          status: { in: [CaseStatus.CLOSED, CaseStatus.ARCHIVED] },
        },
      }),
      this.prisma.case.aggregate({
        where: caseWhere,
        _sum: { recoverableValue: true },
      }),
      this.prisma.case.aggregate({
        where: caseWhere,
        _sum: { collectedFees: true },
      }),
      this.prisma.task.count({
        where: { ...taskWhere, status: TaskStatus.COMPLETED },
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.task.count({
        where: {
          AND: [
            taskWhere,
            {
              OR: [
                { status: TaskStatus.OVERDUE },
                {
                  status: {
                    in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
                  },
                  dueDate: { lt: now },
                },
              ],
            },
          ],
        },
      }),
      this.prisma.task.count({
        where: { ...taskWhere, status: TaskStatus.IN_PROGRESS },
      }),
      this.isManager(user.role)
        ? this.prisma.user.findMany({
            where: { role: UserRole.ASESOR, status: 'ACTIVE' },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          })
        : Promise.resolve([]),
      this.prisma.case.findMany({
        where: caseWhere,
        take: 12,
        orderBy: { lastActivityAt: 'desc' },
        include: {
          deceased: { select: { fullName: true, documentNumber: true } },
          advisor: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.task.findMany({
        where: taskWhere,
        take: 15,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          case: { select: { id: true, internalCode: true } },
          assignee: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
      advisorId
        ? this.prisma.user.findUnique({
            where: { id: advisorId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const closedOrRecovered = recoveredCases + closedCases;
    const successRate =
      totalCases > 0
        ? Math.round((recoveredCases / totalCases) * 1000) / 10
        : 0;

    const scopeLabel = scopedAdvisor
      ? `${scopedAdvisor.firstName} ${scopedAdvisor.lastName}`
      : this.isManager(user.role)
        ? 'Toda la plataforma'
        : `${user.firstName} ${user.lastName}`;

    return {
      mode: this.isManager(user.role) ? ('GLOBAL' as const) : ('ASESOR' as const),
      scope: {
        advisorId,
        label: scopeLabel,
      },
      advisors: advisors.map((a) => ({
        id: a.id,
        name: `${a.firstName} ${a.lastName}`,
        email: a.email,
      })),
      kpis: {
        totalCases,
        activeCases,
        recoveredCases,
        closedCases,
        recoverableValue: Number(valueAgg._sum.recoverableValue ?? 0),
        collectedFees: Number(collectedAgg._sum.collectedFees ?? 0),
        completedTasks,
        pendingTasks,
        overdueTasks,
        inProgressTasks,
        successRate,
        closedOrRecovered,
      },
      cases: recentCases.map((c) => ({
        id: c.id,
        internalCode: c.internalCode,
        status: c.status,
        stage: c.stage,
        deceasedName: c.deceased?.fullName ?? '—',
        documentNumber: c.deceased?.documentNumber ?? '—',
        recoverableValue: Number(c.recoverableValue ?? 0),
        advisor: c.advisor
          ? `${c.advisor.firstName} ${c.advisor.lastName}`
          : 'Sin asesor',
        lastActivityAt: c.lastActivityAt,
      })),
      tasks: recentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate,
        overdue:
          !!t.dueDate &&
          t.dueDate < now &&
          t.status !== TaskStatus.COMPLETED &&
          t.status !== TaskStatus.CANCELLED,
        assignee: t.assignee
          ? `${t.assignee.firstName} ${t.assignee.lastName}`
          : 'Sin asignar',
        caseId: t.case?.id ?? null,
        caseCode: t.case?.internalCode ?? null,
      })),
    };
  }
}
