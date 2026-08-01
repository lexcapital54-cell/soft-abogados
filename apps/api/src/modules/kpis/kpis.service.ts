import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CaseStatus,
  Prisma,
  TaskStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import { KpisQueryDto } from './dto/kpis.dto';

const FINAL_CASE_STATUSES: CaseStatus[] = [
  CaseStatus.CLOSED,
  CaseStatus.RECOVERED,
  CaseStatus.ARCHIVED,
];

const STAGE_LABELS: Record<string, string> = {
  RECEPCION: 'Recepción',
  ANALISIS: 'Análisis',
  DOCUMENTACION: 'Documentación',
  VALIDACION: 'Validación',
  RECLAMACION_EXTRAJUDICIAL: 'Reclamación extrajudicial',
  NEGOCIACION: 'Negociación',
  DEMANDA: 'Demanda',
  PROCESO_JUDICIAL: 'Proceso judicial',
  PAGO: 'Pago',
  ARCHIVO: 'Archivo',
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.round((ms / 86_400_000) * 10) / 10;
}

function pctDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

@Injectable()
export class KpisService {
  constructor(private readonly prisma: PrismaService) {}

  private assertSuperAdmin(user: AuthUser): void {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Indicadores disponibles solo para SUPER_ADMIN',
      );
    }
  }

  private resolveRange(query: KpisQueryDto): {
    from: Date;
    to: Date;
    prevFrom: Date;
    prevTo: Date;
  } {
    const to = query.to ? endOfDay(new Date(query.to)) : endOfDay(new Date());
    const from = query.from
      ? startOfDay(new Date(query.from))
      : startOfDay(new Date(to.getFullYear(), to.getMonth(), 1));

    const spanMs = Math.max(to.getTime() - from.getTime(), 86_400_000);
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - spanMs);

    return { from, to, prevFrom: startOfDay(prevFrom), prevTo: endOfDay(prevTo) };
  }

  async summary(user: AuthUser, query: KpisQueryDto) {
    this.assertSuperAdmin(user);
    const { from, to, prevFrom, prevTo } = this.resolveRange(query);
    const now = new Date();
    const advisorFilter = query.advisorId?.trim() || null;

    const advisors = await this.prisma.user.findMany({
      where: {
        role: UserRole.ASESOR,
        status: 'ACTIVE',
        ...(advisorFilter ? { id: advisorFilter } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const advisorIds = advisors.map((a) => a.id);
    const allAdvisorsForFilter = advisorFilter
      ? await this.prisma.user.findMany({
          where: { role: UserRole.ASESOR, status: 'ACTIVE' },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        })
      : advisors;

    const caseWhereBase: Prisma.CaseWhereInput = advisorFilter
      ? { advisorId: advisorFilter }
      : { advisorId: { in: advisorIds.length ? advisorIds : ['__none__'] } };

    const openTaskStatuses: TaskStatus[] = [
      TaskStatus.PENDING,
      TaskStatus.IN_PROGRESS,
      TaskStatus.OVERDUE,
    ];

    const [
      activeCases,
      prevActiveCases,
      overdueTasksNow,
      prevOverdueSnapshot,
      closedThisWeek,
      casesThisWeek,
      closedPrevWeek,
      casesPrevWeek,
      completedInRange,
      stageGroups,
      openTasks,
      closedCasesInRange,
      casesAssigned,
    ] = await Promise.all([
      this.prisma.case.count({
        where: { ...caseWhereBase, status: CaseStatus.ACTIVE },
      }),
      this.prisma.case.count({
        where: {
          ...caseWhereBase,
          status: CaseStatus.ACTIVE,
          createdAt: { lte: prevTo },
        },
      }),
      this.prisma.task.count({
        where: {
          status: { in: openTaskStatuses },
          dueDate: { lt: now },
          ...(advisorFilter
            ? { assigneeId: advisorFilter }
            : { assigneeId: { in: advisorIds.length ? advisorIds : ['__none__'] } }),
        },
      }),
      this.prisma.task.count({
        where: {
          status: { in: openTaskStatuses },
          dueDate: { lt: prevTo },
          createdAt: { lte: prevTo },
          ...(advisorFilter
            ? { assigneeId: advisorFilter }
            : { assigneeId: { in: advisorIds.length ? advisorIds : ['__none__'] } }),
        },
      }),
      this.prisma.case.count({
        where: {
          ...caseWhereBase,
          status: { in: FINAL_CASE_STATUSES },
          OR: [
            { closedAt: { gte: from, lte: to } },
            {
              closedAt: null,
              updatedAt: { gte: from, lte: to },
              status: { in: FINAL_CASE_STATUSES },
            },
          ],
        },
      }),
      this.prisma.case.count({
        where: {
          ...caseWhereBase,
          OR: [
            { createdAt: { gte: from, lte: to } },
            { status: CaseStatus.ACTIVE },
          ],
        },
      }),
      this.prisma.case.count({
        where: {
          ...caseWhereBase,
          status: { in: FINAL_CASE_STATUSES },
          OR: [
            { closedAt: { gte: prevFrom, lte: prevTo } },
            {
              closedAt: null,
              updatedAt: { gte: prevFrom, lte: prevTo },
            },
          ],
        },
      }),
      this.prisma.case.count({
        where: {
          ...caseWhereBase,
          createdAt: { gte: prevFrom, lte: prevTo },
        },
      }),
      this.prisma.task.findMany({
        where: {
          status: TaskStatus.COMPLETED,
          completedAt: { gte: from, lte: to },
          ...(advisorFilter
            ? { assigneeId: advisorFilter }
            : {
                assigneeId: {
                  in: advisorIds.length ? advisorIds : ['__none__'],
                },
              }),
        },
        select: {
          id: true,
          assigneeId: true,
          createdById: true,
          dueDate: true,
          completedAt: true,
          createdBy: { select: { role: true } },
        },
      }),
      this.prisma.case.groupBy({
        by: ['stage'],
        where: caseWhereBase,
        _count: { _all: true },
      }),
      this.prisma.task.findMany({
        where: {
          status: { in: openTaskStatuses },
          ...(advisorFilter
            ? { assigneeId: advisorFilter }
            : {
                assigneeId: {
                  in: advisorIds.length ? advisorIds : ['__none__'],
                },
              }),
        },
        select: {
          id: true,
          assigneeId: true,
          status: true,
          dueDate: true,
        },
      }),
      this.prisma.case.findMany({
        where: {
          ...caseWhereBase,
          status: { in: FINAL_CASE_STATUSES },
          OR: [
            { closedAt: { gte: from, lte: to } },
            {
              closedAt: null,
              updatedAt: { gte: from, lte: to },
            },
          ],
        },
        select: {
          id: true,
          advisorId: true,
          createdAt: true,
          closedAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.case.groupBy({
        by: ['advisorId'],
        where: caseWhereBase,
        _count: { _all: true },
      }),
    ]);

    const weeklyClosureRate =
      casesThisWeek > 0
        ? Math.round((closedThisWeek / casesThisWeek) * 1000) / 10
        : closedThisWeek > 0
          ? 100
          : 0;
    const prevWeeklyClosure =
      casesPrevWeek > 0
        ? Math.round((closedPrevWeek / casesPrevWeek) * 1000) / 10
        : 0;

    // Burn-down: cierres de tareas por día en el rango
    const burnMap = new Map<string, number>();
    for (const t of completedInRange) {
      if (!t.completedAt) continue;
      const key = t.completedAt.toISOString().slice(0, 10);
      burnMap.set(key, (burnMap.get(key) ?? 0) + 1);
    }
    const burnDown: Array<{ date: string; completed: number }> = [];
    const cursor = new Date(from);
    while (cursor <= to) {
      const key = cursor.toISOString().slice(0, 10);
      burnDown.push({ date: key, completed: burnMap.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    type AdvisorAgg = {
      onTime: number;
      late: number;
      overdueActive: number;
      pending: number;
      inProgress: number;
      proactiveDone: number;
      delegatedDone: number;
      resolutionDays: number[];
      casesAssigned: number;
      casesClosed: number;
    };

    const byAdvisor = new Map<string, AdvisorAgg>();
    for (const a of advisors) {
      byAdvisor.set(a.id, {
        onTime: 0,
        late: 0,
        overdueActive: 0,
        pending: 0,
        inProgress: 0,
        proactiveDone: 0,
        delegatedDone: 0,
        resolutionDays: [],
        casesAssigned: 0,
        casesClosed: 0,
      });
    }

    for (const t of completedInRange) {
      if (!t.assigneeId) continue;
      const row = byAdvisor.get(t.assigneeId);
      if (!row) continue;
      const onTime =
        !t.dueDate ||
        !t.completedAt ||
        t.completedAt.getTime() <= t.dueDate.getTime();
      if (onTime) row.onTime += 1;
      else row.late += 1;

      if (t.createdById && t.createdById === t.assigneeId) {
        row.proactiveDone += 1;
      } else if (t.createdBy?.role === UserRole.SUPER_ADMIN) {
        row.delegatedDone += 1;
      }
    }

    for (const t of openTasks) {
      if (!t.assigneeId) continue;
      const row = byAdvisor.get(t.assigneeId);
      if (!row) continue;
      if (t.status === TaskStatus.IN_PROGRESS) row.inProgress += 1;
      else row.pending += 1;
      if (t.dueDate && t.dueDate < now) row.overdueActive += 1;
    }

    for (const g of casesAssigned) {
      if (!g.advisorId) continue;
      const row = byAdvisor.get(g.advisorId);
      if (row) row.casesAssigned = g._count._all;
    }

    for (const c of closedCasesInRange) {
      if (!c.advisorId) continue;
      const row = byAdvisor.get(c.advisorId);
      if (!row) continue;
      row.casesClosed += 1;
      const end = c.closedAt ?? c.updatedAt;
      row.resolutionDays.push(daysBetween(c.createdAt, end));
    }

    const slaByAdvisor = advisors.map((a) => {
      const row = byAdvisor.get(a.id)!;
      return {
        advisorId: a.id,
        name: `${a.firstName} ${a.lastName}`,
        onTime: row.onTime,
        late: row.late,
        overdueActive: row.overdueActive,
      };
    });

    const leaderboard = advisors.map((a) => {
      const row = byAdvisor.get(a.id)!;
      const done = row.onTime + row.late;
      const efficiencyPct =
        done > 0 ? Math.round((row.onTime / done) * 1000) / 10 : 100;
      const proactiveTotal = row.proactiveDone + row.delegatedDone;
      const proactivityPct =
        proactiveTotal > 0
          ? Math.round((row.proactiveDone / proactiveTotal) * 1000) / 10
          : 0;
      const avgResolutionDays =
        row.resolutionDays.length > 0
          ? Math.round(
              (row.resolutionDays.reduce((s, n) => s + n, 0) /
                row.resolutionDays.length) *
                10,
            ) / 10
          : null;

      return {
        advisorId: a.id,
        name: `${a.firstName} ${a.lastName}`,
        email: a.email,
        casesAssigned: row.casesAssigned,
        casesClosed: row.casesClosed,
        pendingTasks: row.pending + row.inProgress,
        overdueTasks: row.overdueActive,
        efficiencyPct,
        avgResolutionDays,
        proactivityPct,
        workload: row.pending + row.inProgress,
        onTime: row.onTime,
        late: row.late,
        proactiveDone: row.proactiveDone,
        delegatedDone: row.delegatedDone,
      };
    });

    leaderboard.sort(
      (x, y) => y.efficiencyPct - x.efficiencyPct || x.overdueTasks - y.overdueTasks,
    );

    const casesByStage = stageGroups
      .map((g) => ({
        stage: g.stage,
        label: STAGE_LABELS[g.stage] ?? g.stage,
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      scorecards: {
        activeCases: {
          value: activeCases,
          deltaPct: pctDelta(activeCases, prevActiveCases),
        },
        overdueTasks: {
          value: overdueTasksNow,
          deltaPct: pctDelta(overdueTasksNow, prevOverdueSnapshot),
        },
        weeklyClosureRate: {
          value: weeklyClosureRate,
          deltaPct: pctDelta(weeklyClosureRate, prevWeeklyClosure),
        },
      },
      slaByAdvisor,
      burnDown,
      casesByStage,
      leaderboard,
      advisors: allAdvisorsForFilter.map((a) => ({
        id: a.id,
        name: `${a.firstName} ${a.lastName}`,
      })),
    };
  }

  async advisorDetail(
    user: AuthUser,
    advisorId: string,
    query: KpisQueryDto,
  ) {
    this.assertSuperAdmin(user);
    const { from, to } = this.resolveRange(query);
    const now = new Date();

    const advisor = await this.prisma.user.findFirst({
      where: { id: advisorId, role: UserRole.ASESOR },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });
    if (!advisor) throw new NotFoundException('Asesor no encontrado');

    const [impactingCases, overdueTasks, openTasks] = await Promise.all([
      this.prisma.case.findMany({
        where: {
          advisorId,
          OR: [
            { status: CaseStatus.ACTIVE },
            { status: CaseStatus.CRITICAL },
            {
              tasks: {
                some: {
                  status: {
                    in: [
                      TaskStatus.PENDING,
                      TaskStatus.IN_PROGRESS,
                      TaskStatus.OVERDUE,
                    ],
                  },
                  dueDate: { lt: now },
                },
              },
            },
          ],
        },
        take: 40,
        orderBy: { lastActivityAt: 'desc' },
        include: {
          deceased: { select: { fullName: true, documentNumber: true } },
          tasks: {
            where: {
              status: {
                in: [
                  TaskStatus.PENDING,
                  TaskStatus.IN_PROGRESS,
                  TaskStatus.OVERDUE,
                ],
              },
            },
            select: {
              id: true,
              title: true,
              status: true,
              dueDate: true,
            },
          },
        },
      }),
      this.prisma.task.findMany({
        where: {
          assigneeId: advisorId,
          status: {
            in: [
              TaskStatus.PENDING,
              TaskStatus.IN_PROGRESS,
              TaskStatus.OVERDUE,
            ],
          },
          dueDate: { lt: now },
        },
        take: 30,
        orderBy: { dueDate: 'asc' },
        include: {
          case: { select: { id: true, internalCode: true } },
        },
      }),
      this.prisma.task.count({
        where: {
          assigneeId: advisorId,
          status: {
            in: [
              TaskStatus.PENDING,
              TaskStatus.IN_PROGRESS,
              TaskStatus.OVERDUE,
            ],
          },
        },
      }),
    ]);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      advisor: {
        id: advisor.id,
        name: `${advisor.firstName} ${advisor.lastName}`,
        email: advisor.email,
      },
      openTasksCount: openTasks,
      impactingCases: impactingCases.map((c) => {
        const overdue = c.tasks.filter(
          (t) => t.dueDate && t.dueDate < now,
        ).length;
        return {
          id: c.id,
          internalCode: c.internalCode,
          status: c.status,
          stage: c.stage,
          deceasedName: c.deceased?.fullName ?? '—',
          openTasks: c.tasks.length,
          overdueTasks: overdue,
          riskLevel: c.riskLevel,
        };
      }),
      overdueTasks: overdueTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate,
        caseId: t.case?.id ?? null,
        caseCode: t.case?.internalCode ?? null,
      })),
    };
  }
}
