import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type RepoCategoria = 'PLANTILLA' | 'PORTAFOLIO' | 'LEGAL';

export type RepoDocument = {
  id: string;
  nombre: string;
  categoria: RepoCategoria;
  urlAcceso: string;
  storageKey?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  activo: boolean;
  createdAt: string;
  subidoPor?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  } | null;
};

@Injectable({ providedIn: 'root' })
export class RepositoryApiService {
  constructor(private readonly http: HttpClient) {}

  list(opts?: { categoria?: string; search?: string }) {
    let params = new HttpParams();
    if (opts?.categoria) params = params.set('categoria', opts.categoria);
    if (opts?.search) params = params.set('search', opts.search);
    return this.http.get<RepoDocument[]>(
      `${environment.apiBaseUrl}/repository`,
      { params },
    );
  }

  categories() {
    return this.http.get<RepoCategoria[]>(
      `${environment.apiBaseUrl}/repository/categories`,
    );
  }

  upload(file: File, nombre: string, categoria: RepoCategoria) {
    const form = new FormData();
    form.append('file', file);
    form.append('nombre', nombre);
    form.append('categoria', categoria);
    return this.http.post<RepoDocument>(
      `${environment.apiBaseUrl}/repository/upload`,
      form,
    );
  }

  fileUrl(id: string): string {
    return `${environment.apiBaseUrl}/repository/${id}/file`;
  }

  deactivate(id: string) {
    return this.http.delete(`${environment.apiBaseUrl}/repository/${id}`);
  }
}
