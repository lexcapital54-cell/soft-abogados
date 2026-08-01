import { Injectable } from '@nestjs/common';
import {
  CaseStage,
  CaseStatus,
  Prisma,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/auth.decorators';
import {
  AlertLevelFilter,
  DashboardQueryDto,
} from './dto/dashboard.dto';
import { evaluateTaskSla } from '../tasks/sla-engine';

export type SemaphoreTone = 'ok' | 'warning' | 'danger';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(_user: AuthUser, query: DashboardQueryDto) {
    const now = new Date();
    const in3Days = new Date(now);
    in3Days.setDate(in3Days.getDate() + 3);

    const caseWhere: Prisma.CaseWhereInput = {
      ...(query.advisorId ? { advisorId: query.advisorId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
    };

    const [
      totalCases,
      activeCases,
      closedCases,
      recoveredCases,
      valueAgg,
      collectedAgg,
      relativesCount,
      pendingTasks,
      overdueTasks,
      stageGroups,
      advisors,
      recentCases,
      openTasks,
      overdueRelSla,
      soonRelSla,
    ] = await Promise.all([
      this.prisma.case.count({ where: caseWhere }),
      this.prisma.case.count({
        where: { ...caseWhere, status: CaseStatus.ACTIVE },
      }),
      this.prisma.case.count({
        where: {
          ...caseWhere,
          status: { in: [CaseStatus.CLOSED, CaseStatus.ARCHIVED] },
        },
      }),
      this.prisma.case.count({
        where: { ...caseWhere, status: CaseStatus.RECOVERED },
      }),
      this.prisma.case.aggregate({
        where: caseWhere,
        _sum: { recoverableValue: true },
      }),
      this.prisma.case.aggregate({
        where: caseWhere,
        _sum: { collectedFees: true },
      }),
      this.prisma.relative.count({
        where: query.advisorId
          ? { case: { advisorId: query.advisorId } }
          : {},
      }),
      this.prisma.task.count({
        where: {
          status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
          ...(query.advisorId
            ? { case: { advisorId: query.advisorId } }
            : {}),
        },
      }),
      this.prisma.task.count({
        where: {
          OR: [
            { status: TaskStatus.OVERDUE },
            {
              status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
              dueDate: { lt: now },
            },
          ],
          ...(query.advisorId
            ? { case: { advisorId: query.advisorId } }
            : {}),
        },
      }),
      this.prisma.case.groupBy({
        by: ['stage'],
        where: caseWhere,
        _count: { _all: true },
      }),
      this.prisma.user.findMany({
        where: { role: 'ASESOR', status: 'ACTIVE' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.case.findMany({
        where: caseWhere,
        include: {
          deceased: {
            select: { fullName: true, documentNumber: true },
          },
          advisor: {
            select: { id: true, firstName: true, lastName: true },
          },
          relatives: {
            select: { slaDueAt: true },
          },
          financialProducts: {
            select: { entity: { select: { name: true } } },
            take: 1,
          },
        },
        orderBy: [{ lastActivityAt: 'desc' }, { updatedAt: 'desc' }],
        take: 12,
      }),
      this.prisma.task.findMany({
        where: {
          status: {
            in: [
              TaskStatus.PENDING,
              TaskStatus.IN_PROGRESS,
              TaskStatus.OVERDUE,
            ],
          },
          ...(query.advisorId
            ? { case: { advisorId: query.advisorId } }
            : {}),
        },
        include: {
          assignee: {
            select: { id: true, firstName: true, lastName: true },
          },
          case: {
            select: { id: true, internalCode: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 12,
      }),
      this.prisma.relative.count({
        where: {
          slaDueAt: { lt: now },
          ...(query.advisorId
            ? { case: { advisorId: query.advisorId } }
            : {}),
        },
      }),
      this.prisma.relative.count({
        where: {
          slaDueAt: { gte: now, lte: in3Days },
          ...(query.advisorId
            ? { case: { advisorId: query.advisorId } }
            : {}),
        },
      }),
    ]);

    const totalValue = Number(valueAgg._sum.recoverableValue ?? 0);
    const collected = Number(collectedAgg._sum.collectedFees ?? 0);
    const inManagement = Math.max(0, totalValue - collected);
    const successRate =
      totalCases === 0
        ? 0
        : Math.round(((recoveredCases + closedCases * 0.3) / totalCases) * 1000) /
          10;

    // Semáforo por casos (muestra reciente + conteo aproximado)
    const allForSemaforo = await this.prisma.case.findMany({
      where: caseWhere,
      select: {
        id: true,
        priority: true,
        riskLevel: true,
        status: true,
        relatives: { select: { slaDueAt: true } },
      },
    });

    let risk = 0;
    let process = 0;
    let ok = 0;
    const toneByCase = new Map<string, SemaphoreTone>();

    for (const c of allForSemaforo) {
      const tone = this.caseTone(c, now, in3Days);
      toneByCase.set(c.id, tone);
      if (tone === 'danger') risk += 1;
      else if (tone === 'warning') process += 1;
      else ok += 1;
    }

    const alertFilter = query.alertLevel ?? AlertLevelFilter.ALL;
    const filterTone = (t: SemaphoreTone) => {
      if (alertFilter === AlertLevelFilter.ALL) return true;
      if (alertFilter === AlertLevelFilter.RISK) return t === 'danger';
      if (alertFilter === AlertLevelFilter.PROCESS) return t === 'warning';
      return t === 'ok';
    };

    const recent = recentCases
      .map((c) => {
        const tone = toneByCase.get(c.id) ?? this.caseTone(c, now, in3Days);
        return {
          id: c.id,
          internalCode: c.internalCode,
          deceasedName: c.deceased.fullName,
          documentNumber: c.deceased.documentNumber,
          recoverableValue: Number(c.recoverableValue),
          entity:
            c.financialProducts[0]?.entity?.name ?? 'Sin entidad',
          advisor: c.advisor
            ? `${c.advisor.firstName} ${c.advisor.lastName}`.trim()
            : 'Sin asignar',
          stage: c.stage,
          status: c.status,
          semaphore: tone,
          lastActivityAt: c.lastActivityAt ?? c.updatedAt,
        };
      })
      .filter((c) => filterTone(c.semaphore));

    const stageOrder: CaseStage[] = [
      CaseStage.RECEPCION,
      CaseStage.ANALISIS,
      CaseStage.DOCUMENTACION,
      CaseStage.VALIDACION,
      CaseStage.RECLAMACION_EXTRAJUDICIAL,
      CaseStage.RESPUESTA_ENTIDAD,
      CaseStage.NEGOCIACION,
      CaseStage.DEMANDA,
      CaseStage.PROCESO_JUDICIAL,
      CaseStage.SENTENCIA,
      CaseStage.PAGO,
      CaseStage.ARCHIVO,
    ];

    const stageLabels: Record<string, string> = {
      RECEPCION: 'Contacto inicial',
      ANALISIS: 'Análisis jurídico',
      DOCUMENTACION: 'Recolección documentos',
      VALIDACION: 'Validación',
      RECLAMACION_EXTRAJUDICIAL: 'Reclamación',
      RESPUESTA_ENTIDAD: 'Respuesta entidad',
      NEGOCIACION: 'Negociación',
      DEMANDA: 'Demanda',
      PROCESO_JUDICIAL: 'En trámite',
      SENTENCIA: 'Sentencia',
      PAGO: 'Recuperado',
      ARCHIVO: 'Archivo',
    };

    const stageMap = new Map(
      stageGroups.map((g) => [g.stage, g._count._all]),
    );
    const stages = stageOrder.map((stage) => ({
      stage,
      label: stageLabels[stage] ?? stage,
      count: stageMap.get(stage) ?? 0,
    }));

    const advisorStats = await Promise.all(
      advisors.map(async (a) => {
        const [assigned, recovered, riskCount] = await Promise.all([
          this.prisma.case.count({ where: { advisorId: a.id } }),
          this.prisma.case.count({
            where: {
              advisorId: a.id,
              status: {
                in: [CaseStatus.RECOVERED, CaseStatus.CLOSED],
              },
            },
          }),
          this.prisma.case.count({
            where: {
              advisorId: a.id,
              OR: [
                { riskLevel: 'HIGH' },
                { priority: 'CRITICAL' },
                {
                  relatives: {
                    some: { slaDueAt: { lt: now } },
                  },
                },
              ],
            },
          }),
        ]);
        const inGestion = Math.max(0, assigned - recovered);
        const recoveryPct =
          assigned === 0 ? 0 : Math.round((recovered / assigned) * 100);
        return {
          id: a.id,
          name: `${a.firstName} ${a.lastName}`.trim(),
          email: a.email,
          assigned,
          inGestion,
          recovered,
          recoveryPct,
          bottlenecks: riskCount,
        };
      }),
    );

    const tasks = openTasks.map((t) => {
      const sla = evaluateTaskSla(t, now);
      const overdue = sla.overdue || sla.tone === 'red';
      return {
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        status: overdue ? 'OVERDUE' : t.status,
        overdue,
        slaTone: sla.tone as 'green' | 'yellow' | 'red',
        slaLabel: sla.label,
        assignee: t.assignee
          ? `${t.assignee.firstName} ${t.assignee.lastName}`.trim()
          : 'Sin asignar',
        caseId: t.case?.id ?? null,
        caseCode: t.case?.internalCode ?? null,
      };
    });

    const alerts = [
      ...tasks
        .filter((t) => t.overdue)
        .slice(0, 5)
        .map((t) => ({
          id: `task-${t.id}`,
          tone: 'danger' as SemaphoreTone,
          title: `Tarea vencida: ${t.title}`,
          detail: t.caseCode
            ? `${t.caseCode} · ${t.assignee}`
            : t.assignee,
        })),
      ...(overdueRelSla > 0
        ? [
            {
              id: 'sla-overdue',
              tone: 'danger' as SemaphoreTone,
              title: `${overdueRelSla} SLA familiares vencidos`,
              detail: 'Requieren reagendo o gestión inmediata',
            },
          ]
        : []),
      ...(soonRelSla > 0
        ? [
            {
              id: 'sla-soon',
              tone: 'warning' as SemaphoreTone,
              title: `${soonRelSla} SLA por vencer (≤3 días)`,
              detail: 'Prevenga incumplimientos documentales',
            },
          ]
        : []),
      ...(risk > 0
        ? [
            {
              id: 'cases-risk',
              tone: 'danger' as SemaphoreTone,
              title: `${risk} casos en riesgo`,
              detail: 'Semáforo rojo — cuellos de botella',
            },
          ]
        : []),
    ].slice(0, 12);

    const semaforoTotal = risk + process + ok || 1;

    return {
      kpis: {
        totalCases,
        activeCases,
        closedCases,
        recoveredCases,
        totalValue,
        collected,
        inManagement,
        relativesCount,
        pendingTasks,
        overdueTasks,
        successRate,
        successTarget: 35,
      },
      semaforo: {
        risk: {
          count: risk,
          percent: Math.round((risk / semaforoTotal) * 1000) / 10,
        },
        process: {
          count: process,
          percent: Math.round((process / semaforoTotal) * 1000) / 10,
        },
        ok: {
          count: ok,
          percent: Math.round((ok / semaforoTotal) * 1000) / 10,
        },
      },
      stages,
      recentCases: recent,
      advisors: advisorStats,
      tasks,
      alerts,
      filters: {
        advisorId: query.advisorId ?? null,
        status: query.status ?? null,
        stage: query.stage ?? null,
        alertLevel: alertFilter,
      },
    };
  }

  private caseTone(
    c: {
      priority?: string;
      riskLevel?: string;
      status?: string;
      relatives?: Array<{ slaDueAt: Date | null }>;
    },
    now: Date,
    in3Days: Date,
  ): SemaphoreTone {
    if (
      c.priority === 'CRITICAL' ||
      c.riskLevel === 'HIGH' ||
      c.status === 'CRITICAL'
    ) {
      return 'danger';
    }
    const slas = c.relatives ?? [];
    if (slas.some((r) => r.slaDueAt && r.slaDueAt < now)) {
      return 'danger';
    }
    if (
      c.priority === 'HIGH' ||
      slas.some(
        (r) =>
          r.slaDueAt && r.slaDueAt >= now && r.slaDueAt <= in3Days,
      )
    ) {
      return 'warning';
    }
    return 'ok';
  }
}
