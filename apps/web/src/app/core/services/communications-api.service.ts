import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type EmailRecipient = {
  id: string;
  label: string;
  email: string;
};

export type CaseAttachmentOption = {
  id: string;
  name: string;
  category: string;
  status: string;
  mimeType?: string | null;
  fileSize?: number | null;
};

export type SendEmailPayload = {
  to: string;
  subject: string;
  message: string;
  caseDocumentIds?: string[];
  repoDocumentIds?: string[];
};

export type SendEmailResult = {
  ok: boolean;
  logId: string;
  from: string;
  to: string;
  attachments: string[];
  simulated: boolean;
  message: string;
};

@Injectable({ providedIn: 'root' })
export class CommunicationsApiService {
  constructor(private readonly http: HttpClient) {}

  meta() {
    return this.http.get<{ sender: string; senders: string[] }>(
      `${environment.apiBaseUrl}/communications/meta`,
    );
  }

  recipients(caseId: string) {
    return this.http.get<EmailRecipient[]>(
      `${environment.apiBaseUrl}/communications/cases/${caseId}/recipients`,
    );
  }

  caseAttachments(caseId: string) {
    return this.http.get<CaseAttachmentOption[]>(
      `${environment.apiBaseUrl}/communications/cases/${caseId}/attachments`,
    );
  }

  send(caseId: string, payload: SendEmailPayload) {
    return this.http.post<SendEmailResult>(
      `${environment.apiBaseUrl}/communications/cases/${caseId}/send`,
      payload,
    );
  }
}
