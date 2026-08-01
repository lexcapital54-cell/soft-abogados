import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type AuditUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
};

export type AuditLogItem = {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  caseId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  createdAt: string;
  user: AuditUser | null;
};

export type AuditListResponse = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AuditListQuery = {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  caseId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/** Acciones críticas para filtros forenses */
export const AUDIT_ACTIONS = [
  'CASO_CREADO',
  'CASO_ACTUALIZADO',
  'CAMBIO_HONORARIOS',
  'CAMBIO_ETAPA',
  'CASO_REASIGNADO',
  'CASO_ELIMINADO',
  'DOCUMENTO_CARGADO',
  'CAMBIO_ESTADO_DOCUMENTO',
  'DOCUMENTO_ELIMINADO',
  'HEREDERO_CREADO',
  'HEREDERO_ACTUALIZADO',
  'HEREDERO_CONTACTADO',
  'SLA_REAGENDADO',
  'NOTA_ESTRATEGICA',
  'ACTIVIDAD_REGISTRADA',
  'TAREA_CREADA',
  'TAREA_ACTUALIZADA',
  'TRASLADO_AREA_JURIDICA',
] as const;

@Injectable({ providedIn: 'root' })
export class AuditApiService {
  constructor(private readonly http: HttpClient) {}

  list(query: AuditListQuery = {}) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<AuditListResponse>(
      `${environment.apiBaseUrl}/audit`,
      { params },
    );
  }

  getById(id: string) {
    return this.http.get<AuditLogItem>(`${environment.apiBaseUrl}/audit/${id}`);
  }
}
