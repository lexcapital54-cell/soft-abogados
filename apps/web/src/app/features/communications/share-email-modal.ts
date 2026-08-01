import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideLoaderCircle,
  LucideMail,
  LucideX,
  LucidePaperclip,
} from '@lucide/angular';
import {
  CaseAttachmentOption,
  CommunicationsApiService,
  EmailRecipient,
} from '../../core/services/communications-api.service';
import {
  RepoDocument,
  RepositoryApiService,
} from '../../core/services/repository-api.service';
import { AuthService } from '../../core/auth/auth.service';

type AttachTab = 'case' | 'repo';

@Component({
  selector: 'app-share-email-modal',
  imports: [FormsModule, LucideLoaderCircle, LucideMail, LucideX, LucidePaperclip],
  templateUrl: './share-email-modal.html',
  styleUrl: './share-email-modal.css',
})
export class ShareEmailModalComponent implements OnChanges {
  private readonly communications = inject(CommunicationsApiService);
  private readonly repository = inject(RepositoryApiService);
  readonly auth = inject(AuthService);

  @Input() open = false;
  @Input({ required: true }) caseId!: string;
  @Input() caseLabel = '';
  @Input() deceasedName = '';

  @Output() closed = new EventEmitter<void>();
  @Output() sent = new EventEmitter<string>();

  readonly loading = signal(false);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly sender = signal('');
  readonly recipients = signal<EmailRecipient[]>([]);
  readonly caseDocs = signal<CaseAttachmentOption[]>([]);
  readonly repoDocs = signal<RepoDocument[]>([]);
  readonly tab = signal<AttachTab>('case');

  to = '';
  customTo = '';
  subject = '';
  message = '';
  selectedCaseDocs = new Set<string>();
  selectedRepoDocs = new Set<string>();

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['open'] || changes['caseId']) && this.open && this.caseId) {
      this.resetForm();
      this.load();
    }
  }

  private resetForm(): void {
    this.error.set(null);
    this.to = '';
    this.customTo = '';
    this.selectedCaseDocs = new Set();
    this.selectedRepoDocs = new Set();
    this.tab.set('case');
    const name = this.deceasedName || 'el expediente';
    this.subject = `Comunicación oficial LEX CAPITAL — ${this.caseLabel || name}`;
    this.message = `Estimado(a),\n\nPor medio de la presente, LEX CAPITAL se permite compartir documentación relacionada con el expediente ${this.caseLabel || ''} correspondiente a ${name}.\n\nQuedamos atentos a cualquier inquietud.\n\nCordialmente,\nEquipo LEX CAPITAL\nwww.lexcapital.com.co`;
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    let pending = 4;
    const done = () => {
      pending -= 1;
      if (pending <= 0) this.loading.set(false);
    };

    this.communications.meta().subscribe({
      next: (m) => {
        this.sender.set(m.sender);
        done();
      },
      error: () => {
        this.sender.set(this.auth.user()?.email ?? '');
        done();
      },
    });

    this.communications.recipients(this.caseId).subscribe({
      next: (r) => {
        this.recipients.set(r);
        if (r.length) this.to = r[0].email;
        done();
      },
      error: () => done(),
    });

    this.communications.caseAttachments(this.caseId).subscribe({
      next: (d) => {
        this.caseDocs.set(d);
        done();
      },
      error: () => done(),
    });

    this.repository.list().subscribe({
      next: (d) => {
        this.repoDocs.set(d);
        done();
      },
      error: () => done(),
    });
  }

  toggleCaseDoc(id: string): void {
    const next = new Set(this.selectedCaseDocs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedCaseDocs = next;
  }

  toggleRepoDoc(id: string): void {
    const next = new Set(this.selectedRepoDocs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedRepoDocs = next;
  }

  selectedCount(): number {
    return this.selectedCaseDocs.size + this.selectedRepoDocs.size;
  }

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    const dest = (this.to === '__custom__' ? this.customTo : this.to).trim();
    if (!dest || !dest.includes('@')) {
      this.error.set('Indique un destinatario válido');
      return;
    }
    if (!this.subject.trim() || this.message.trim().length < 10) {
      this.error.set('Asunto y mensaje son obligatorios');
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    this.communications
      .send(this.caseId, {
        to: dest,
        subject: this.subject.trim(),
        message: this.message.trim(),
        caseDocumentIds: [...this.selectedCaseDocs],
        repoDocumentIds: [...this.selectedRepoDocs],
      })
      .subscribe({
        next: (res) => {
          this.sending.set(false);
          this.sent.emit(res.message);
          this.close();
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.sending.set(false);
          const msg = err?.error?.message;
          this.error.set(
            Array.isArray(msg)
              ? msg.join(', ')
              : typeof msg === 'string'
                ? msg
                : 'No se pudo enviar el correo',
          );
        },
      });
  }
}
