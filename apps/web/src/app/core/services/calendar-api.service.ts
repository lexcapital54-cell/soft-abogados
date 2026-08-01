import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type CalendarEventDto = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  dateKey: string;
  caseId: string;
  caseCode: string | null;
  deceasedName: string | null;
  status: string;
  taskType: string;
  description: string | null;
  assigneeId: string | null;
  assigneeName: string;
  assigneeInitials: string;
  createdByName: string | null;
  slaTone: 'green' | 'yellow' | 'red';
  slaLabel: string;
  resourceId: string | null;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

export type NonWorkingDay = {
  date: string;
  reason: 'weekend' | 'holiday';
  label: string;
  isNonWorkingDay: true;
};

export type CalendarEventsResponse = {
  timezone: string;
  mode: 'GLOBAL' | 'ASESOR';
  range: { from: string; to: string };
  nonWorkingDays: NonWorkingDay[];
  events: CalendarEventDto[];
};

export type CalendarResource = {
  id: string;
  title: string;
  email: string;
};

@Injectable({ providedIn: 'root' })
export class CalendarApiService {
  constructor(private readonly http: HttpClient) {}

  events(from: string, to: string, advisorIds?: string[]) {
    let params = new HttpParams().set('from', from).set('to', to);
    if (advisorIds?.length) {
      params = params.set('advisorIds', advisorIds.join(','));
    }
    return this.http.get<CalendarEventsResponse>(
      `${environment.apiBaseUrl}/calendar/events`,
      { params },
    );
  }

  resources() {
    return this.http.get<CalendarResource[]>(
      `${environment.apiBaseUrl}/calendar/resources`,
    );
  }

  move(id: string, body: { assigneeId?: string; dueDate?: string }) {
    return this.http.patch<{
      id: string;
      dueDate: string | null;
      assigneeId: string | null;
      assigneeName: string | null;
      slaTone: string;
      caseId: string;
    }>(`${environment.apiBaseUrl}/calendar/events/${id}/move`, body);
  }
}
