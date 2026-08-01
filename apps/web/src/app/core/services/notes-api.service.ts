import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type PersonalNote = {
  id: string;
  usuarioId: string;
  contenido: string;
  colorFondo: string;
  orden: number;
  createdAt: string;
  updatedAt: string;
};

@Injectable({ providedIn: 'root' })
export class NotesApiService {
  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<PersonalNote[]>(`${environment.apiBaseUrl}/notes`);
  }

  create(payload?: { contenido?: string; colorFondo?: string }) {
    return this.http.post<PersonalNote>(
      `${environment.apiBaseUrl}/notes`,
      payload ?? {},
    );
  }

  update(
    id: string,
    payload: { contenido?: string; colorFondo?: string; orden?: number },
  ) {
    return this.http.patch<PersonalNote>(
      `${environment.apiBaseUrl}/notes/${id}`,
      payload,
    );
  }

  remove(id: string) {
    return this.http.delete(`${environment.apiBaseUrl}/notes/${id}`);
  }
}
