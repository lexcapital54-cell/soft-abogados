import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ReportsPerformance = {
  mode: 'GLOBAL' | 'ASESOR';
  scope: {
    advisorId: string | null;
    label: string;
  };
  advisors: Array<{ id: string; name: string; email: string }>;
  kpis: {
    totalCases: number;
    activeCases: number;
    recoveredCases: number;
    closedCases: number;
    recoverableValue: number;
    collectedFees: number;
    completedTasks: number;
    pendingTasks: number;
    overdueTasks: number;
    inProgressTasks: number;
    successRate: number;
    closedOrRecovered: number;
  };
  cases: Array<{
    id: string;
    internalCode: string;
    status: string;
    stage: string;
    deceasedName: string;
    documentNumber: string;
    recoverableValue: number;
    advisor: string;
    lastActivityAt: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
    overdue: boolean;
    assignee: string;
    caseId: string | null;
    caseCode: string | null;
  }>;
};

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  constructor(private readonly http: HttpClient) {}

  performance(advisorId?: string | null) {
    let params = new HttpParams();
    if (advisorId) params = params.set('advisorId', advisorId);
    return this.http.get<ReportsPerformance>(
      `${environment.apiBaseUrl}/reports/performance`,
      { params },
    );
  }
}
