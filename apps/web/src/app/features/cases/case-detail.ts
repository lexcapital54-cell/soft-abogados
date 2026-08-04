import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  LucideAlertTriangle,
  LucideBanknote,
  LucideCalendarClock,
  LucideCheckCircle,
  LucideClock,
  LucideEdit2,
  LucideEye,
  LucideFileText,
  LucideLoaderCircle,
  LucidePencil,
  LucidePhone,
  LucidePlus,
  LucideStickyNote,
  LucideTrash2,
  LucideUpload,
  LucideMail,
} from '@lucide/angular';
import { CasesApiService } from '../../core/services/cases-api.service';
import {
  CaseDocument,
  ChecklistResponse,
  DocumentsApiService,
} from '../../core/services/documents-api.service';
import {
  KinshipType,
  RelativesApiService,
} from '../../core/services/relatives-api.service';
import { TasksApiService } from '../../core/services/tasks-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { StatusBadgeComponent } from './shared/status-badge';
import { DocumentViewerModalComponent } from './shared/document-viewer-modal';
import { TaskAssignerModalComponent } from '../tasks/task-assigner-modal';
import { ShareEmailModalComponent } from '../communications/share-email-modal';
import { resolveSlaStatus, stageProgress } from './shared/sla-status';

export type CaseDetailDto = {
  id: string;
  internalCode: string;
  fileNumber: string;
  status: string;
  stage: string;
  priority: string;
  riskLevel?: string;
  recoverableValue: string | number;
  feesPercent?: string | number;
  estimatedFees: string | number;
  collectedFees?: string | number;
  documentaryProgress?: number;
  observations?: string | null;
  strategicNotes?: string | null;
  storageFolderPath?: string | null;
  city?: string | null;
  department?: string | null;
  createdAt?: string;
  lastActivityAt?: string | null;
  financialProducts?: Array<{
    id: string;
    entity?: { id: string; name: string } | null;
  }>;
  deceased: {
    id: string;
    fullName: string;
    documentNumber: string;
    city?: string | null;
    department?: string | null;
    observations?: string | null;
    birthDate?: string | null;
    maritalStatus?: string | null;
    lastAddress?: string | null;
  };
  advisor?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  } | null;
  relatives: Array<{
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
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    dueDate?: string | null;
  }>;
  activities: Array<{
    id: string;
    type?: string;
    title: string;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    user?: { firstName?: string; lastName?: string } | null;
  }>;
};

type RelativeRow = CaseDetailDto['relatives'][number];
type DocTab = 'cliente' | 'familiares';

const KINSHIP_OPTIONS: Array<{ value: KinshipType; label: string }> = [
  { value: 'CONYUGE', label: 'Cónyuge' },
  { value: 'COMPANERO_PERMANENTE', label: 'Compañero(a) permanente' },
  { value: 'HIJO', label: 'Hijo' },
  { value: 'HIJA', label: 'Hija' },
  { value: 'PADRE', label: 'Padre' },
  { value: 'MADRE', label: 'Madre' },
  { value: 'HERMANO', label: 'Hermano' },
  { value: 'HERMANA', label: 'Hermana' },
  { value: 'NIETO', label: 'Nieto' },
  { value: 'NIETA', label: 'Nieta' },
  { value: 'OTRO', label: 'Otro' },
];

const STAGE_OPTIONS = [
  'RECEPCION',
  'CONTACTO',
  'DOCUMENTACION',
  'ANALISIS',
  'NEGOCIACION',
  'ACUERDO',
  'JUDICIAL',
  'COBRO',
  'CERRADO',
];

@Component({
  selector: 'app-case-detail',
  imports: [
    RouterLink,
    FormsModule,
    CurrencyPipe,
    DatePipe,
    StatusBadgeComponent,
    DocumentViewerModalComponent,
    TaskAssignerModalComponent,
    ShareEmailModalComponent,
    LucideAlertTriangle,
    LucideBanknote,
    LucideCalendarClock,
    LucideCheckCircle,
    LucideClock,
    LucideEdit2,
    LucideEye,
    LucideFileText,
    LucideLoaderCircle,
    LucidePencil,
    LucidePhone,
    LucidePlus,
    LucideStickyNote,
    LucideTrash2,
    LucideUpload,
    LucideMail,
  ],
  templateUrl: './case-detail.html',
  styleUrl: './case-detail.css',
})
export class CaseDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CasesApiService);
  private readonly docsApi = inject(DocumentsApiService);
  private readonly relativesApi = inject(RelativesApiService);
  private readonly tasksApi = inject(TasksApiService);
  readonly auth = inject(AuthService);

  readonly item = signal<CaseDetailDto | null>(null);
  readonly checklist = signal<ChecklistResponse | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);
  readonly toast = signal<string | null>(null);
  readonly uploadingId = signal<string | null>(null);
  readonly viewingDoc = signal<CaseDocument | null>(null);
  readonly docTab = signal<DocTab>('cliente');
  readonly actionsOpen = signal(false);
  readonly showEditCase = signal(false);
  readonly showAddRelative = signal(false);
  readonly showAddTask = signal(false);
  readonly showShareEmail = signal(false);

  readonly savingRelative = signal(false);
  readonly savingEdit = signal(false);
  readonly savingNotes = signal(false);
  readonly savingActivity = signal(false);
  readonly savingCase = signal(false);
  readonly savingTask = signal(false);
  readonly savingFees = signal(false);
  readonly contactingId = signal<string | null>(null);
  readonly contactPanelId = signal<string | null>(null);
  readonly editPanelId = signal<string | null>(null);
  readonly slaPanelId = signal<string | null>(null);
  readonly contactNote = signal('');
  readonly contactChannel = signal<'CALL' | 'WHATSAPP' | 'EMAIL' | 'COMMENT'>(
    'CALL',
  );

  readonly kinshipOptions = KINSHIP_OPTIONS;
  readonly stageOptions = STAGE_OPTIONS;

  newFullName = '';
  newDocumentNumber = '';
  newKinship: KinshipType = 'HIJO';
  newMobile = '';
  newEmail = '';
  newSlaDueAt = '';

  editFullName = '';
  editDocumentNumber = '';
  editKinship: KinshipType = 'HIJO';
  editMobile = '';
  editEmail = '';
  editObservations = '';

  slaDueAt = '';
  slaReason = '';

  strategicNotesDraft = '';
  activityText = '';
  createCommitment = false;
  commitmentTitle = '';
  commitmentDueAt = '';

  editRecoverable = 0;
  editStage = 'RECEPCION';
  editCollected = 0;
  editCaseObservations = '';

  newTaskTitle = '';
  newTaskDue = '';

  readonly caseId = computed(
    () => this.route.snapshot.paramMap.get('id') ?? '',
  );
  readonly canDelete = computed(() => this.auth.isSuperAdmin());
  readonly canApprove = computed(() => this.auth.isSuperAdmin());
  readonly canManageFamily = computed(() => !!this.auth.user());

  readonly feesPercent = computed(() => {
    const c = this.item();
    if (!c) return 30;
    const stored = Number(c.feesPercent);
    if (stored === 30 || stored === 50) return stored;
    const value = Number(c.recoverableValue) || 0;
    const fees = Number(c.estimatedFees) || 0;
    if (value <= 0) return 30;
    return fees / value >= 0.4 ? 50 : 30;
  });

  readonly estimatedFeesLive = computed(() => {
    const c = this.item();
    if (!c) return 0;
    return Math.round((Number(c.recoverableValue) || 0) * (this.feesPercent() / 100));
  });

  readonly progress = computed(() =>
    stageProgress(this.item()?.stage ?? 'RECEPCION'),
  );

  readonly docsPercent = computed(
    () => this.checklist()?.progress.percent ?? this.item()?.documentaryProgress ?? 0,
  );

  readonly docsReady = computed(
    () => (this.checklist()?.progress.percent ?? 0) >= 100,
  );

  readonly kpis = computed(() => {
    const c = this.item();
    if (!c) return [];
    const openTasks = (c.tasks ?? []).filter((t) =>
      ['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(t.status),
    );
    const next = openTasks[0];
    const entity =
      c.financialProducts?.find((p) => p.entity?.name)?.entity?.name ?? '—';
    const risk = (c.riskLevel ?? 'MEDIUM').toUpperCase();
    const semaforo =
      risk === 'HIGH' || risk === 'CRITICAL'
        ? 'Rojo'
        : risk === 'LOW'
          ? 'Verde'
          : 'Amarillo';
    const assigned = c.createdAt
      ? new Date(c.createdAt).toLocaleDateString('es-CO', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '—';
    const value = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number(c.recoverableValue ?? 0));

    return [
      { key: 'fecha', label: 'Fecha asignación', value: assigned, danger: false },
      { key: 'valor', label: 'Valor estimado', value, danger: false },
      { key: 'entidad', label: 'Entidad', value: entity, danger: false },
      { key: 'etapa', label: 'Etapa actual', value: c.stage, danger: false },
      {
        key: 'semaforo',
        label: 'Semáforo',
        value: semaforo,
        danger: semaforo === 'Rojo',
        tone: semaforo === 'Rojo' ? 'red' : semaforo === 'Amarillo' ? 'yellow' : 'green',
      },
      {
        key: 'proxima',
        label: 'Próxima acción',
        value: next?.title ?? 'Sin tareas abiertas',
        danger: false,
      },
    ];
  });

  readonly openTasksCount = computed(
    () =>
      (this.item()?.tasks ?? []).filter((t) =>
        ['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(t.status),
      ).length,
  );

  readonly advancePct = computed(() => {
    const docs = this.docsPercent();
    const p = this.progress();
    return Math.round(docs * 0.4 + p.management * 0.35 + p.judicial * 0.25);
  });

  readonly donutAdvance = computed(() => {
    const pct = this.advancePct();
    return `conic-gradient(#0b132b 0% ${pct}%, #e2e8f0 ${pct}% 100%)`;
  });

  entityName(): string {
    const c = this.item();
    return (
      c?.financialProducts?.find((p) => p.entity?.name)?.entity?.name ?? '—'
    );
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    const id = this.caseId();
    if (!id) {
      this.error.set('Caso no encontrado');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.getById(id).subscribe({
      next: (res) => {
        const data = res as CaseDetailDto;
        this.item.set(data);
        this.strategicNotesDraft = data.strategicNotes ?? '';
        this.loading.set(false);
        this.ensureDocs(id);
      },
      error: (err: { status?: number }) => {
        this.loading.set(false);
        this.error.set(
          err?.status === 403
            ? 'No tiene permiso para ver este caso'
            : 'No se pudo cargar el caso',
        );
      },
    });
  }

  ensureDocs(caseId: string): void {
    this.docsApi.ensureChecklist(caseId).subscribe({
      next: (res) => this.checklist.set(res),
      error: () => {
        this.docsApi.getChecklist(caseId).subscribe({
          next: (res) => this.checklist.set(res),
          error: () => this.checklist.set(null),
        });
      },
    });
  }

  toggleActions(): void {
    this.actionsOpen.update((v) => !v);
  }

  transferBlocked(): void {
    this.actionsOpen.set(false);
    this.showToast(
      this.docsReady()
        ? 'Traslado a Jurídica: próximamente'
        : 'No se puede trasladar: faltan documentos obligatorios',
    );
  }

  openEditCase(): void {
    const c = this.item();
    if (!c) return;
    this.actionsOpen.set(false);
    this.editRecoverable = Number(c.recoverableValue) || 0;
    this.editStage = c.stage || 'RECEPCION';
    this.editCollected = Number(c.collectedFees) || 0;
    this.editCaseObservations = c.observations ?? '';
    this.showEditCase.set(true);
  }

  saveEditCase(): void {
    this.savingCase.set(true);
    this.api
      .update(this.caseId(), {
        recoverableValue: this.editRecoverable,
        stage: this.editStage,
        collectedFees: this.editCollected,
        observations: this.editCaseObservations.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.savingCase.set(false);
          this.showEditCase.set(false);
          this.showToast('Datos principales actualizados');
          this.reloadCaseOnly();
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.savingCase.set(false);
          this.showToast(this.errMsg(err, 'No se pudo actualizar el caso'));
        },
      });
  }

  setFeesPercent(pct: 30 | 50): void {
    this.savingFees.set(true);
    this.api.update(this.caseId(), { feesPercent: pct }).subscribe({
      next: () => {
        this.savingFees.set(false);
        this.showToast(`Honorarios: ${pct}%`);
        this.reloadCaseOnly();
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.savingFees.set(false);
        this.showToast(this.errMsg(err, 'No se pudo actualizar honorarios'));
      },
    });
  }

  saveNotes(): void {
    this.savingNotes.set(true);
    this.api
      .update(this.caseId(), { strategicNotes: this.strategicNotesDraft })
      .subscribe({
        next: () => {
          this.savingNotes.set(false);
          this.showToast('Notas estratégicas guardadas');
          this.reloadCaseOnly();
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.savingNotes.set(false);
          this.showToast(this.errMsg(err, 'No se pudieron guardar las notas'));
        },
      });
  }

  registerActivity(): void {
    const description = this.activityText.trim();
    if (description.length < 3) {
      this.showToast('Escriba la acción de gestión');
      return;
    }
    if (this.createCommitment) {
      if (!this.commitmentTitle.trim() || !this.commitmentDueAt) {
        this.showToast('Complete título y fecha del compromiso');
        return;
      }
    }
    this.savingActivity.set(true);
    this.api
      .addActivity(this.caseId(), {
        description,
        createCommitment: this.createCommitment,
        commitmentTitle: this.commitmentTitle.trim() || undefined,
        commitmentDueAt: this.commitmentDueAt || undefined,
      })
      .subscribe({
        next: () => {
          this.savingActivity.set(false);
          this.activityText = '';
          this.createCommitment = false;
          this.commitmentTitle = '';
          this.commitmentDueAt = '';
          this.showToast('Acción registrada en bitácora');
          this.reloadCaseOnly();
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.savingActivity.set(false);
          this.showToast(this.errMsg(err, 'No se pudo registrar la acción'));
        },
      });
  }

  addTask(): void {
    this.showAddTask.set(true);
  }

  onTaskCreated(): void {
    this.showToast('Tarea creada y vinculada al expediente');
    this.reloadCaseOnly();
  }

  onEmailSent(message: string): void {
    this.showToast(message || 'Correo enviado');
    this.reloadCaseOnly();
  }

  completeTask(id: string): void {
    this.tasksApi.update(id, { status: 'COMPLETED' }).subscribe({
      next: () => {
        this.showToast('Tarea completada');
        this.reloadCaseOnly();
      },
      error: () => this.showToast('No se pudo completar la tarea'),
    });
  }

  addRelative(): void {
    const c = this.item();
    if (!c) return;
    const fullName = this.newFullName.trim();
    if (fullName.length < 3) {
      this.showToast('Indique el nombre completo del familiar');
      return;
    }
    this.savingRelative.set(true);
    this.relativesApi
      .create({
        caseId: c.id,
        deceasedId: c.deceased.id,
        fullName,
        kinship: this.newKinship,
        documentNumber: this.newDocumentNumber.trim() || undefined,
        mobile: this.newMobile.trim() || undefined,
        email: this.newEmail.trim() || undefined,
        slaDueAt: this.newSlaDueAt || undefined,
      })
      .subscribe({
        next: () => {
          this.savingRelative.set(false);
          this.newFullName = '';
          this.newDocumentNumber = '';
          this.newMobile = '';
          this.newEmail = '';
          this.newSlaDueAt = '';
          this.newKinship = 'HIJO';
          this.showAddRelative.set(false);
          this.showToast('Familiar agregado');
          this.reloadCaseOnly();
          this.ensureDocs(this.caseId());
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.savingRelative.set(false);
          this.showToast(this.errMsg(err, 'No se pudo agregar el familiar'));
        },
      });
  }

  isPendingRelative(r: RelativeRow): boolean {
    return /^pendiente(\s+\d+)?$/i.test((r.fullName || '').trim());
  }

  openEdit(r: RelativeRow): void {
    this.contactPanelId.set(null);
    this.slaPanelId.set(null);
    this.editPanelId.set(r.id);
    this.editFullName = this.isPendingRelative(r) ? '' : r.fullName;
    this.editDocumentNumber = r.documentNumber ?? '';
    this.editKinship = (KINSHIP_OPTIONS.some((k) => k.value === r.kinship)
      ? r.kinship
      : 'OTRO') as KinshipType;
    this.editMobile = r.mobile || r.phone || '';
    this.editEmail = r.email ?? '';
    this.editObservations = r.observations ?? '';
  }

  cancelEdit(): void {
    this.editPanelId.set(null);
  }

  saveEdit(relativeId: string): void {
    const fullName = this.editFullName.trim();
    if (fullName.length < 3) {
      this.showToast('Indique el nombre real del familiar');
      return;
    }
    this.savingEdit.set(true);
    this.relativesApi
      .update(relativeId, {
        fullName,
        kinship: this.editKinship,
        documentNumber: this.editDocumentNumber.trim(),
        mobile: this.editMobile.trim(),
        email: this.editEmail.trim(),
        observations: this.editObservations.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.savingEdit.set(false);
          this.editPanelId.set(null);
          this.showToast('Datos del familiar actualizados');
          this.reloadCaseOnly();
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.savingEdit.set(false);
          this.showToast(this.errMsg(err, 'No se pudo actualizar'));
        },
      });
  }

  openSla(r: RelativeRow): void {
    this.editPanelId.set(null);
    this.contactPanelId.set(null);
    this.slaPanelId.set(r.id);
    this.slaDueAt = r.slaDueAt
      ? new Date(r.slaDueAt).toISOString().slice(0, 10)
      : '';
    this.slaReason = '';
  }

  saveSla(relativeId: string): void {
    if (!this.slaDueAt || this.slaReason.trim().length < 3) {
      this.showToast('Indique fecha y motivo del reagendo');
      return;
    }
    this.relativesApi
      .rescheduleSla(relativeId, {
        slaDueAt: new Date(this.slaDueAt).toISOString(),
        reason: this.slaReason.trim(),
      })
      .subscribe({
        next: () => {
          this.slaPanelId.set(null);
          this.showToast('SLA actualizado');
          this.reloadCaseOnly();
        },
        error: (err: { error?: { message?: string | string[] } }) =>
          this.showToast(this.errMsg(err, 'No se pudo reagendar el SLA')),
      });
  }

  openContact(relativeId: string): void {
    this.editPanelId.set(null);
    this.slaPanelId.set(null);
    this.contactPanelId.set(relativeId);
    this.contactNote.set('');
    this.contactChannel.set('CALL');
  }

  cancelContact(): void {
    this.contactPanelId.set(null);
  }

  submitContact(relativeId: string, relativeName: string): void {
    const note = this.contactNote().trim();
    if (note.length < 3) {
      this.showToast('Escriba una nota de al menos 3 caracteres');
      return;
    }
    this.contactingId.set(relativeId);
    this.relativesApi
      .contact(relativeId, { note, channel: this.contactChannel() })
      .subscribe({
        next: () => {
          this.contactingId.set(null);
          this.contactPanelId.set(null);
          this.showToast(`Contacto registrado: ${relativeName}`);
          this.reloadCaseOnly();
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.contactingId.set(null);
          this.showToast(this.errMsg(err, 'No se pudo registrar el contacto'));
        },
      });
  }

  onFilePick(doc: CaseDocument, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadingId.set(doc.id);
    this.docsApi.uploadToDocument(doc.id, this.caseId(), file).subscribe({
      next: (ev) => {
        if (ev.done) {
          this.uploadingId.set(null);
          this.showToast(`Archivo cargado: ${doc.name}`);
          this.ensureDocs(this.caseId());
          this.reloadCaseOnly();
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.uploadingId.set(null);
        this.showToast(err?.error?.message ?? 'No se pudo cargar el archivo');
      },
    });
  }

  openViewer(doc: CaseDocument): void {
    if (!doc.storageKey && !doc.storageUrl) return;
    this.viewingDoc.set(doc);
  }

  closeViewer(): void {
    this.viewingDoc.set(null);
  }

  onViewerApproved(doc: CaseDocument): void {
    this.showToast(`Aprobado: ${doc.name}`);
    this.ensureDocs(this.caseId());
    this.reloadCaseOnly();
  }

  onViewerRejected(doc: CaseDocument): void {
    this.showToast(`Rechazado / ilegible: ${doc.name}`);
    this.ensureDocs(this.caseId());
    this.reloadCaseOnly();
  }

  approve(doc: CaseDocument): void {
    if (!this.canApprove()) return;
    this.docsApi.updateStatus(doc.id, 'APROBADO').subscribe({
      next: () => {
        this.showToast(`Aprobado: ${doc.name}`);
        this.ensureDocs(this.caseId());
      },
      error: (err: { error?: { message?: string } }) =>
        this.showToast(err?.error?.message ?? 'No se pudo aprobar'),
    });
  }

  reject(doc: CaseDocument): void {
    if (!this.canApprove()) return;
    this.docsApi.updateStatus(doc.id, 'RECHAZADO').subscribe({
      next: () => {
        this.showToast(`Rechazado: ${doc.name}`);
        this.ensureDocs(this.caseId());
      },
      error: (err: { error?: { message?: string } }) =>
        this.showToast(err?.error?.message ?? 'No se pudo rechazar'),
    });
  }

  remove(doc: CaseDocument): void {
    if (!this.canDelete()) return;
    if (!confirm(`¿Eliminar archivo de “${doc.name}”?`)) return;
    this.docsApi.remove(doc.id).subscribe({
      next: () => {
        this.showToast(`Archivo eliminado: ${doc.name}`);
        this.ensureDocs(this.caseId());
      },
      error: (err: { error?: { message?: string } }) =>
        this.showToast(err?.error?.message ?? 'No se pudo eliminar'),
    });
  }

  kinshipLabel(value: string): string {
    return KINSHIP_OPTIONS.find((k) => k.value === value)?.label ?? value;
  }

  contactLabel(status: string): string {
    const map: Record<string, string> = {
      SIN_CONTACTAR: 'Sin contactar',
      CONTACTADO: 'Contactado',
      INTERESADO: 'Interesado',
      NO_INTERESADO: 'No interesado',
      NO_LOCALIZADO: 'No localizado',
      EN_NEGOCIACION: 'En negociación',
    };
    return map[status?.toUpperCase()] ?? status;
  }

  contactBadge(
    status: string,
  ): 'ok' | 'warning' | 'danger' | 'info' | 'neutral' {
    const s = status?.toUpperCase() ?? '';
    if (['CONTACTADO', 'INTERESADO', 'EN_NEGOCIACION'].includes(s)) return 'ok';
    if (s === 'SIN_CONTACTAR') return 'danger';
    if (['NO_LOCALIZADO', 'NO_INTERESADO'].includes(s)) return 'warning';
    return 'neutral';
  }

  slaOf(dueAt?: string | null, delivered = false) {
    return resolveSlaStatus(dueAt, { delivered });
  }

  docDelivered(doc: CaseDocument): boolean {
    return ['APROBADO', 'CARGADO'].includes(doc.status);
  }

  statusBadge(
    status: string,
  ): 'ok' | 'warning' | 'danger' | 'info' | 'neutral' {
    const s = status?.toUpperCase() ?? '';
    if (['APROBADO', 'CARGADO', 'ACTIVE'].includes(s)) return 'ok';
    if (['EN_REVISION', 'SOLICITADO'].includes(s)) return 'warning';
    if (['PENDIENTE', 'NO_SOLICITADO', 'RECHAZADO', 'CRITICAL'].includes(s))
      return 'danger';
    return 'neutral';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'Pendiente',
      CARGADO: 'Listo',
      APROBADO: 'Listo / Aprobado',
      RECHAZADO: 'Rechazado',
      EN_REVISION: 'En revisión',
      SOLICITADO: 'Solicitado',
      NO_SOLICITADO: 'Pendiente',
    };
    return map[status?.toUpperCase()] ?? status;
  }

  private reloadCaseOnly(): void {
    this.api.getById(this.caseId()).subscribe({
      next: (res) => {
        const data = res as CaseDetailDto;
        this.item.set(data);
        this.strategicNotesDraft = data.strategicNotes ?? this.strategicNotesDraft;
      },
    });
  }

  private errMsg(
    err: { error?: { message?: string | string[] } },
    fallback: string,
  ): string {
    const msg = err?.error?.message;
    return Array.isArray(msg) ? msg.join(', ') : (msg ?? fallback);
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    window.setTimeout(() => this.toast.set(null), 2800);
  }
}
