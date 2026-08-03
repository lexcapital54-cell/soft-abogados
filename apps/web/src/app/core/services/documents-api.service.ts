import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Observable, filter, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CaseDocument = {
  id: string;
  caseId: string;
  name: string;
  category: string;
  status: string;
  isRequired?: boolean;
  storageKey?: string | null;
  storageUrl?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedAt?: string | null;
  slaDueAt?: string | null;
  createdAt: string;
  relativeId?: string | null;
  relative?: {
    id: string;
    fullName: string;
    kinship: string;
  } | null;
  documentType?: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
  } | null;
};

export type ChecklistResponse = {
  storageFolderPath?: string | null;
  progress: { required: number; ready: number; percent: number };
  titular: CaseDocument[];
  legal: CaseDocument[];
  cliente: CaseDocument[];
  familiares: CaseDocument[];
};

export type UploadProgress = {
  progress: number;
  done: boolean;
  result?: unknown;
};

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  constructor(private readonly http: HttpClient) {}

  listByCase(caseId: string) {
    return this.http.get<CaseDocument[]>(
      `${environment.apiBaseUrl}/documents`,
      { params: { caseId } },
    );
  }

  getChecklist(caseId: string) {
    return this.http.get<ChecklistResponse>(
      `${environment.apiBaseUrl}/documents/checklist`,
      { params: { caseId } },
    );
  }

  ensureChecklist(caseId: string) {
    return this.http.post<ChecklistResponse>(
      `${environment.apiBaseUrl}/documents/checklist/ensure`,
      { caseId },
    );
  }

  uploadToDocument(documentId: string, caseId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    form.append('caseId', caseId);
    form.append('documentId', documentId);
    return this.uploadForm(form, file);
  }

  /** Carga libre (sin fila de checklist) */
  upload(caseId: string, file: File, tipoDocumento: string) {
    const form = new FormData();
    form.append('file', file);
    form.append('caseId', caseId);
    form.append('tipoDocumento', tipoDocumento);
    return this.uploadForm(form, file);
  }

  private uploadForm(form: FormData, file: File) {
    return this.http
      .post(`${environment.apiBaseUrl}/documents/upload`, form, {
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        map((event: HttpEvent<unknown>): UploadProgress | null => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? file.size;
            return {
              progress: Math.min(99, Math.round((100 * event.loaded) / total)),
              done: false,
            };
          }
          if (event.type === HttpEventType.Response) {
            return { progress: 100, done: true, result: event.body };
          }
          return null;
        }),
        filter((v): v is UploadProgress => v !== null),
      );
  }

  updateStatus(documentId: string, status: string) {
    return this.http.patch(
      `${environment.apiBaseUrl}/documents/${documentId}/status`,
      { status },
    );
  }

  remove(documentId: string) {
    return this.http.delete(
      `${environment.apiBaseUrl}/documents/${documentId}`,
    );
  }

  /** Preferir URL pública de Supabase; si no, proxy autenticado de la API */
  fileUrl(doc: Pick<CaseDocument, 'storageKey' | 'storageUrl'>): string | null {
    if (
      doc.storageUrl &&
      /^https?:\/\//i.test(doc.storageUrl) &&
      !doc.storageUrl.includes('/documents/file')
    ) {
      return doc.storageUrl;
    }
    if (doc.storageKey) {
      return `${environment.apiBaseUrl}/documents/file?key=${encodeURIComponent(doc.storageKey)}`;
    }
    return doc.storageUrl ?? null;
  }

  /** Descarga como Blob con sesión JWT (URLs privadas) */
  fetchBlob(doc: Pick<CaseDocument, 'storageKey' | 'storageUrl'>) {
    const url = this.fileUrl(doc);
    if (!url) {
      throw new Error('Documento sin archivo asociado');
    }
    return this.http.get(url, {
      responseType: 'blob',
      observe: 'response',
    });
  }
}
