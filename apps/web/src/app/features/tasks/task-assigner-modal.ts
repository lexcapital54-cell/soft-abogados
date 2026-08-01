import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideLoaderCircle,
  LucideX,
  LucideCheckSquare,
} from '@lucide/angular';
import {
  AssignableResponse,
  AssignableUser,
  CreateTaskPayload,
  TasksApiService,
} from '../../core/services/tasks-api.service';
import {
  CaseListItem,
  CasesApiService,
} from '../../core/services/cases-api.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-task-assigner-modal',
  imports: [FormsModule, LucideLoaderCircle, LucideX, LucideCheckSquare],
  templateUrl: './task-assigner-modal.html',
  styleUrl: './task-assigner-modal.css',
})
export class TaskAssignerModalComponent implements OnInit, OnChanges {
  private readonly tasksApi = inject(TasksApiService);
  private readonly casesApi = inject(CasesApiService);
  readonly auth = inject(AuthService);

  /** Caso prellenado / bloqueado. Vacío si allowCasePick */
  @Input() caseId = '';
  @Input() caseLabel = '';
  @Input() open = false;
  /** Permite elegir expediente (p. ej. desde calendario) */
  @Input() allowCasePick = false;
  /** Fecha SLA sugerida (YYYY-MM-DD) */
  @Input() defaultDueDate = '';

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  readonly assignable = signal<AssignableResponse | null>(null);
  readonly cases = signal<CaseListItem[]>([]);
  readonly taskTypes = signal<Array<{ value: string; label: string }>>([]);
  readonly saving = signal(false);
  readonly loadingUsers = signal(false);
  readonly loadingCases = signal(false);
  readonly error = signal<string | null>(null);

  selectedCaseId = '';
  taskType = 'OTRO';
  title = '';
  description = '';
  dueDate = '';
  assigneeId = '';
  priority = 'MEDIUM';
  userFilter = '';
  caseSearch = '';

  ngOnInit(): void {
    this.tasksApi.meta().subscribe({
      next: (m) => this.taskTypes.set(m.taskTypes),
      error: () => this.taskTypes.set([{ value: 'OTRO', label: 'Otro' }]),
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open) return;
    if (changes['open'] || changes['caseId'] || changes['defaultDueDate']) {
      this.selectedCaseId = this.caseId || '';
      if (this.defaultDueDate) this.dueDate = this.defaultDueDate;
      if (this.allowCasePick && !this.caseId) {
        this.loadCases();
      }
      if (this.effectiveCaseId()) {
        this.loadAssignable();
      } else {
        this.assignable.set(null);
        this.assigneeId = '';
      }
    }
  }

  effectiveCaseId(): string {
    return this.allowCasePick ? this.selectedCaseId : this.caseId;
  }

  onCasePicked(id: string): void {
    this.selectedCaseId = id;
    if (id) this.loadAssignable();
    else {
      this.assignable.set(null);
      this.assigneeId = '';
    }
  }

  private loadCases(): void {
    this.loadingCases.set(true);
    this.casesApi.list({ pageSize: 100, search: this.caseSearch || undefined }).subscribe({
      next: (res) => {
        this.cases.set(res.items);
        this.loadingCases.set(false);
      },
      error: () => {
        this.loadingCases.set(false);
        this.error.set('No se pudieron cargar los casos');
      },
    });
  }

  searchCases(): void {
    this.loadCases();
  }

  private loadAssignable(): void {
    const caseId = this.effectiveCaseId();
    if (!caseId) return;
    this.loadingUsers.set(true);
    this.error.set(null);
    this.tasksApi.assignable(caseId).subscribe({
      next: (res) => {
        this.assignable.set(res);
        this.assigneeId = res.defaultAssigneeId ?? '';
        this.loadingUsers.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loadingUsers.set(false);
        this.assignable.set(null);
        this.error.set(
          err?.error?.message ??
            'No se pudo cargar la lista de asignación permitida',
        );
      },
    });
  }

  creatorLabel(): string {
    const c = this.assignable()?.creator;
    const u = this.auth.user();
    if (c) return `${c.firstName} ${c.lastName} (${c.role})`;
    if (u) return `${u.firstName} ${u.lastName}`;
    return 'Sesión actual';
  }

  filteredUsers(): AssignableUser[] {
    const q = this.userFilter.trim().toLowerCase();
    const list = this.assignable()?.users ?? [];
    if (!q) return list;
    return list.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.tag ?? '').toLowerCase().includes(q),
    );
  }

  hint(): string {
    const mode = this.assignable()?.mode;
    if (mode === 'ASESOR') {
      return 'Como asesor solo puede autoasignarse o escalar a un SUPER_ADMIN.';
    }
    if (mode === 'SUPER_ADMIN') {
      return 'Puede asignar al asesor del caso, a usted o a cualquier miembro del equipo.';
    }
    return '';
  }

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    const caseId = this.effectiveCaseId();
    if (!caseId) {
      this.error.set('Caso obligatorio para crear la tarea.');
      return;
    }
    if (!this.assigneeId) {
      this.error.set('Seleccione el responsable de la tarea.');
      return;
    }
    const payload: CreateTaskPayload = {
      caseId,
      taskType: this.taskType,
      title: this.title.trim() || undefined,
      description: this.description.trim() || undefined,
      dueDate: this.dueDate || undefined,
      assigneeId: this.assigneeId,
      priority: this.priority,
    };
    this.saving.set(true);
    this.error.set(null);
    this.tasksApi.create(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.title = '';
        this.description = '';
        this.dueDate = '';
        this.created.emit();
        this.close();
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg)
            ? msg.join(', ')
            : typeof msg === 'string'
              ? msg
              : 'No se pudo crear la tarea',
        );
      },
    });
  }
}
