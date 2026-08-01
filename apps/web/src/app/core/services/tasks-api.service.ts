import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type TaskSla = {
  tone: 'green' | 'yellow' | 'red';
  label: string;
  businessDaysRemaining: number | null;
  overdue: boolean;
};

export type TaskDto = {
  id: string;
  caseId: string;
  title: string;
  description?: string | null;
  taskType?: string;
  taskTypeLabel?: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  createdAt: string;
  assigneeId?: string | null;
  sla?: TaskSla;
  case?: {
    id: string;
    internalCode: string;
    fileNumber: string;
    advisorId?: string | null;
    riskLevel?: string;
    deceased?: { fullName: string; documentNumber: string } | null;
  } | null;
  assignee?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  } | null;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

export type CreateTaskPayload = {
  caseId: string;
  title?: string;
  description?: string;
  taskType?: string;
  priority?: string;
  dueDate?: string;
  assigneeId?: string;
};

export type UpdateTaskPayload = {
  title?: string;
  description?: string;
  taskType?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  assigneeId?: string | null;
};

export type TaskMeta = {
  taskTypes: Array<{ value: string; label: string }>;
  statuses: string[];
};

export type AssignableUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  suggested?: boolean;
  tag?: string;
};

export type AssignableResponse = {
  mode: 'ASESOR' | 'SUPER_ADMIN';
  defaultAssigneeId: string | null;
  caseAdvisorId?: string | null;
  creator: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  users: AssignableUser[];
};

export type ListTasksQuery = {
  caseId?: string;
  assigneeId?: string;
  status?: string;
  taskType?: string;
  sla?: string;
  pageSize?: number;
};

@Injectable({ providedIn: 'root' })
export class TasksApiService {
  constructor(private readonly http: HttpClient) {}

  meta() {
    return this.http.get<TaskMeta>(`${environment.apiBaseUrl}/tasks/meta`);
  }

  assignable(caseId: string) {
    return this.http.get<AssignableResponse>(
      `${environment.apiBaseUrl}/tasks/assignable`,
      { params: { caseId } },
    );
  }

  list(query: ListTasksQuery = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    }
    return this.http.get<TaskDto[]>(`${environment.apiBaseUrl}/tasks`, {
      params,
    });
  }

  listByCase(caseId: string) {
    return this.list({ caseId, pageSize: 100 });
  }

  create(payload: CreateTaskPayload) {
    return this.http.post<TaskDto>(`${environment.apiBaseUrl}/tasks`, payload);
  }

  update(id: string, payload: UpdateTaskPayload) {
    return this.http.patch<TaskDto>(
      `${environment.apiBaseUrl}/tasks/${id}`,
      payload,
    );
  }
}
