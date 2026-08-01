import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type KpiDelta = { value: number; deltaPct: number };

export type KpisSummary = {
  range: { from: string; to: string };
  scorecards: {
    activeCases: KpiDelta;
    overdueTasks: KpiDelta;
    weeklyClosureRate: KpiDelta;
  };
  slaByAdvisor: Array<{
    advisorId: string;
    name: string;
    onTime: number;
    late: number;
    overdueActive: number;
  }>;
  burnDown: Array<{ date: string; completed: number }>;
  casesByStage: Array<{ stage: string; label: string; count: number }>;
  leaderboard: Array<{
    advisorId: string;
    name: string;
    email: string;
    casesAssigned: number;
    casesClosed: number;
    pendingTasks: number;
    overdueTasks: number;
    efficiencyPct: number;
    avgResolutionDays: number | null;
    proactivityPct: number;
    workload: number;
    onTime: number;
    late: number;
    proactiveDone: number;
    delegatedDone: number;
  }>;
  advisors: Array<{ id: string; name: string }>;
};

export type AdvisorKpiDetail = {
  range: { from: string; to: string };
  advisor: { id: string; name: string; email: string };
  openTasksCount: number;
  impactingCases: Array<{
    id: string;
    internalCode: string;
    status: string;
    stage: string;
    deceasedName: string;
    openTasks: number;
    overdueTasks: number;
    riskLevel: string;
  }>;
  overdueTasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
    caseId: string | null;
    caseCode: string | null;
  }>;
};

export type KpisQuery = {
  from?: string;
  to?: string;
  advisorId?: string | null;
};

@Injectable({ providedIn: 'root' })
export class KpisApiService {
  constructor(private readonly http: HttpClient) {}

  summary(query: KpisQuery = {}) {
    let params = new HttpParams();
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    if (query.advisorId) params = params.set('advisorId', query.advisorId);
    return this.http.get<KpisSummary>(`${environment.apiBaseUrl}/kpis/summary`, {
      params,
    });
  }

  advisorDetail(advisorId: string, query: KpisQuery = {}) {
    let params = new HttpParams();
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    return this.http.get<AdvisorKpiDetail>(
      `${environment.apiBaseUrl}/kpis/advisors/${advisorId}/detail`,
      { params },
    );
  }
}
