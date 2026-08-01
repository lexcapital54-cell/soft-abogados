import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type KinshipType =
  | 'CONYUGE'
  | 'COMPANERO_PERMANENTE'
  | 'HIJO'
  | 'HIJA'
  | 'PADRE'
  | 'MADRE'
  | 'HERMANO'
  | 'HERMANA'
  | 'NIETO'
  | 'NIETA'
  | 'OTRO';

export type CreateRelativePayload = {
  caseId: string;
  deceasedId?: string;
  fullName: string;
  kinship: KinshipType;
  documentNumber?: string;
  mobile?: string;
  phone?: string;
  email?: string;
  observations?: string;
  slaDueAt?: string;
};

export type UpdateRelativePayload = {
  fullName?: string;
  kinship?: KinshipType;
  documentNumber?: string;
  mobile?: string;
  phone?: string;
  email?: string;
  observations?: string;
  slaDueAt?: string | null;
};

export type ContactRelativePayload = {
  note: string;
  channel?: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS' | 'MEETING' | 'VISIT' | 'COMMENT';
};

export type RescheduleSlaPayload = {
  slaDueAt: string;
  reason: string;
};

export type RelativeDto = {
  id: string;
  fullName: string;
  kinship: string;
  contactStatus: string;
  documentNumber?: string | null;
  mobile?: string | null;
  phone?: string | null;
  email?: string | null;
  observations?: string | null;
  slaDueAt?: string | null;
};

@Injectable({ providedIn: 'root' })
export class RelativesApiService {
  constructor(private readonly http: HttpClient) {}

  create(payload: CreateRelativePayload) {
    return this.http.post<RelativeDto>(
      `${environment.apiBaseUrl}/relatives`,
      payload,
    );
  }

  update(relativeId: string, payload: UpdateRelativePayload) {
    return this.http.patch<RelativeDto>(
      `${environment.apiBaseUrl}/relatives/${relativeId}`,
      payload,
    );
  }

  contact(relativeId: string, payload: ContactRelativePayload) {
    return this.http.post<RelativeDto>(
      `${environment.apiBaseUrl}/relatives/${relativeId}/contact`,
      payload,
    );
  }

  rescheduleSla(relativeId: string, payload: RescheduleSlaPayload) {
    return this.http.post<RelativeDto>(
      `${environment.apiBaseUrl}/relatives/${relativeId}/sla`,
      payload,
    );
  }
}
