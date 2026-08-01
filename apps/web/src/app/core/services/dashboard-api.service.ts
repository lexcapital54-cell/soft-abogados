import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type SemaphoreTone = 'ok' | 'warning' | 'danger';

export type DashboardFilters = {
  advisorId?: string | null;
  status?: string | null;
  stage?: string | null;
  alertLevel?: 'ALL' | 'RISK' | 'PROCESS' | 'OK' | null;
};

export type DashboardSummary = {
  kpis: {
    totalCases: number;
    activeCases: number;
    closedCases: number;
    recoveredCases: number;
    totalValue: number;
    collected: number;
    inManagement: number;
    relativesCount: number;
    pendingTasks: number;
    overdueTasks: number;
    successRate: number;
    successTarget: number;
  };
  semaforo: {
    risk: { count: number; percent: number };
    process: { count: number; percent: number };
    ok: { count: number; percent: number };
  };
  stages: Array<{ stage: string; label: string; count: number }>;
  recentCases: Array<{
    id: string;
    internalCode: string;
    deceasedName: string;
    documentNumber: string;
    recoverableValue: number;
    entity: string;
    advisor: string;
    stage: string;
    status: string;
    semaphore: SemaphoreTone;
    lastActivityAt: string;
  }>;
  advisors: Array<{
    id: string;
    name: string;
    email: string;
    assigned: number;
    inGestion: number;
    recovered: number;
    recoveryPct: number;
    bottlenecks: number;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    dueDate?: string | null;
    status: string;
    overdue: boolean;
    slaTone?: 'green' | 'yellow' | 'red';
    slaLabel?: string;
    assignee: string;
    caseId?: string | null;
    caseCode?: string | null;
  }>;
  alerts: Array<{
    id: string;
    tone: SemaphoreTone;
    title: string;
    detail: string;
  }>;
};

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  constructor(private readonly http: HttpClient) {}

  getSummary(filters?: DashboardFilters) {
    let params = new HttpParams();
    if (filters?.advisorId) params = params.set('advisorId', filters.advisorId);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.stage) params = params.set('stage', filters.stage);
    if (filters?.alertLevel && filters.alertLevel !== 'ALL') {
      params = params.set('alertLevel', filters.alertLevel);
    }
    return this.http.get<DashboardSummary>(
      `${environment.apiBaseUrl}/dashboard/summary`,
      { params },
    );
  }
}
