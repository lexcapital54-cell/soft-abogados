import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type KinshipPerson = {
  id: string;
  source: 'TITULAR' | 'CANDIDATO';
  cedula: string | null;
  nombres: string;
  primerApellido: string;
  segundoApellido: string;
  fullName: string;
  ciudadNacimiento: string | null;
  ciudadExpedicion: string | null;
  anioNacimiento: number | null;
  nombresPadres: string | null;
};

export type KinshipRelation = {
  id: string;
  titularId: string;
  familiarId: string;
  titular: KinshipPerson;
  familiar: KinshipPerson;
  degree: 1 | 2 | 3 | 4;
  label: string;
  labelDisplay: string;
  confidence: number;
  reasons: string[];
  edgePath?: string[];
};

export type KinshipAnalyzeResult = {
  titulares: KinshipPerson[];
  candidatos: KinshipPerson[];
  relations: KinshipRelation[];
  stats: {
    titulares: number;
    candidatos: number;
    matches: number;
    avgConfidence: number;
    usedAi: boolean;
  };
};

export type KinshipGraphPayload = {
  nodes: Array<{
    id: string;
    label: string;
    cedula: string | null;
    anioNacimiento: number | null;
    source: 'TITULAR' | 'CANDIDATO';
    x: number;
    y: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    degree: number;
    label: string;
  }>;
};

@Injectable({ providedIn: 'root' })
export class KinshipApiService {
  constructor(private readonly http: HttpClient) {}

  aiStatus() {
    return this.http.get<{ available: boolean }>(
      `${environment.apiBaseUrl}/kinship/ai-status`,
    );
  }

  preview(rows: Record<string, unknown>[]) {
    return this.http.post<{
      columns: string[];
      sample: Record<string, unknown>[];
      normalizedPreview: KinshipPerson[];
    }>(`${environment.apiBaseUrl}/kinship/preview`, { rows });
  }

  analyze(
    titulares: Record<string, unknown>[],
    candidatos: Record<string, unknown>[],
    useAi = false,
  ) {
    return this.http.post<KinshipAnalyzeResult>(
      `${environment.apiBaseUrl}/kinship/analyze`,
      { titulares, candidatos, useAi },
    );
  }

  graph(
    titulares: KinshipPerson[],
    candidatos: KinshipPerson[],
    relation: KinshipRelation,
  ) {
    return this.http.post<KinshipGraphPayload>(
      `${environment.apiBaseUrl}/kinship/graph`,
      { titulares, candidatos, relation },
    );
  }

  validate(payload: {
    caseId: string;
    fullName: string;
    kinship: string;
    documentNumber?: string;
    city?: string;
    observations?: string;
    relationId?: string;
  }) {
    return this.http.post(`${environment.apiBaseUrl}/kinship/validate`, payload);
  }
}
