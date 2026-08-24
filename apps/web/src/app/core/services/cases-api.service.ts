import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type CaseListItem = {
  id: string;
  internalCode: string;
  fileNumber: string;
  status: string;
  stage: string;
  priority: string;
  recoverableValue: string | number;
  deceased: {
    id: string;
    fullName: string;
    documentNumber: string;
  };
  advisor?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  _count?: {
    relatives?: number;
    documents?: number;
    tasks?: number;
  };
};

export type CaseListResponse = {
  items: CaseListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CreateDeceasedPayload = {
  documentNumber: string;
  fullName: string;
  city?: string;
  department?: string;
  observations?: string;
};

export type CreateCasePayload = {
  deceasedId: string;
  recoverableValue?: number;
  estimatedFees?: number;
  feesPercent?: number;
  priority?: string;
  city?: string;
  department?: string;
  observations?: string;
};

export type UpdateCasePayload = {
  status?: string;
  stage?: string;
  priority?: string;
  riskLevel?: string;
  recoverableValue?: number;
  feesPercent?: number;
  estimatedFees?: number;
  collectedFees?: number;
  city?: string;
  department?: string;
  observations?: string;
  strategicNotes?: string;
};

export type CreateActivityPayload = {
  description: string;
  type?: string;
  createCommitment?: boolean;
  commitmentTitle?: string;
  commitmentDueAt?: string;
};

@Injectable({ providedIn: 'root' })
export class CasesApiService {
  constructor(private readonly http: HttpClient) {}

  list(options?: {
    search?: string;
    page?: number;
    pageSize?: number;
    advisorId?: string;
    priority?: string;
  }) {
    let params = new HttpParams()
      .set('page', String(options?.page ?? 1))
      .set('pageSize', String(options?.pageSize ?? 25));
    if (options?.search) {
      params = params.set('search', options.search);
    }
    if (options?.advisorId) {
      params = params.set('advisorId', options.advisorId);
    }
    if (options?.priority) {
      params = params.set('priority', options.priority);
    }
    return this.http.get<CaseListResponse>(`${environment.apiBaseUrl}/cases`, {
      params,
    });
  }

  getById(id: string) {
    return this.http.get(`${environment.apiBaseUrl}/cases/${id}`);
  }

  update(id: string, payload: UpdateCasePayload) {
    return this.http.patch(`${environment.apiBaseUrl}/cases/${id}`, payload);
  }

  addActivity(caseId: string, payload: CreateActivityPayload) {
    return this.http.post(
      `${environment.apiBaseUrl}/cases/${caseId}/activities`,
      payload,
    );
  }

  createDeceased(payload: CreateDeceasedPayload) {
    return this.http.post<{ id: string }>(
      `${environment.apiBaseUrl}/deceased`,
      payload,
    );
  }

  createCase(payload: CreateCasePayload) {
    return this.http.post(`${environment.apiBaseUrl}/cases`, payload);
  }
}
