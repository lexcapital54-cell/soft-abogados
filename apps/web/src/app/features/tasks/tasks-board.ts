import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideCheckCircle,
  LucideLayoutGrid,
  LucideList,
  LucideLoaderCircle,
  LucideRefreshCw,
} from '@lucide/angular';
import {
  TaskDto,
  TasksApiService,
} from '../../core/services/tasks-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { StatusBadgeComponent } from '../cases/shared/status-badge';

type ViewMode = 'table' | 'kanban';

@Component({
  selector: 'app-tasks-board',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    StatusBadgeComponent,
    LucideCheckCircle,
    LucideLayoutGrid,
    LucideList,
    LucideLoaderCircle,
    LucideRefreshCw,
  ],
  templateUrl: './tasks-board.html',
  styleUrl: './tasks-board.css',
})
export class TasksBoardPage implements OnInit {
  private readonly api = inject(TasksApiService);
  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly tasks = signal<TaskDto[]>([]);
  readonly view = signal<ViewMode>('kanban');
  readonly filterSla = signal('');
  readonly filterStatus = signal('');
  /** Inbox: solo tareas asignadas al usuario actual (p. ej. escalamientos al Super Admin) */
  readonly filterMine = signal(false);
  readonly updatingId = signal<string | null>(null);

  readonly filtered = computed(() => {
    let list = this.tasks();
    const sla = this.filterSla();
    const st = this.filterStatus();
    const me = this.auth.user()?.id;
    if (this.filterMine() && me) {
      list = list.filter((t) => t.assigneeId === me);
    }
    if (sla) list = list.filter((t) => t.sla?.tone === sla);
    if (st) list = list.filter((t) => t.status === st);
    return list;
  });

  readonly inboxCount = computed(() => {
    const me = this.auth.user()?.id;
    if (!me) return 0;
    return this.tasks().filter(
      (t) =>
        t.assigneeId === me && !['COMPLETED', 'CANCELLED'].includes(t.status),
    ).length;
  });

  readonly columns = computed(() => {
    const list = this.filtered();
    return {
      PENDING: list.filter(
        (t) => t.status === 'PENDING' || t.status === 'OVERDUE',
      ),
      IN_PROGRESS: list.filter((t) => t.status === 'IN_PROGRESS'),
      COMPLETED: list.filter((t) => t.status === 'COMPLETED'),
    } as Record<string, TaskDto[]>;
  });

  columnTasks(key: string): TaskDto[] {
    return this.columns()[key] ?? [];
  }
  readonly counts = computed(() => {
    const list = this.tasks();
    return {
      red: list.filter((t) => t.sla?.tone === 'red').length,
      yellow: list.filter((t) => t.sla?.tone === 'yellow').length,
      green: list.filter((t) => t.sla?.tone === 'green').length,
      open: list.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status))
        .length,
    };
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list({ pageSize: 200 }).subscribe({
      next: (items) => {
        this.tasks.set(items);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string }; status?: number }) => {
        this.loading.set(false);
        this.error.set(
          err?.status === 403
            ? 'Sin permiso para ver el tablero de tareas.'
            : err?.error?.message ?? 'No se pudieron cargar las tareas',
        );
      },
    });
  }

  caseLabel(t: TaskDto): string {
    const code = t.case?.internalCode ?? 'Sin caso';
    const name = t.case?.deceased?.fullName;
    return name ? `${code} — ${name}` : code;
  }

  assigneeName(t: TaskDto): string {
    if (!t.assignee) return 'Sin asignar';
    return `${t.assignee.firstName} ${t.assignee.lastName}`;
  }

  creatorName(t: TaskDto): string {
    if (!t.createdBy) return '—';
    return `${t.createdBy.firstName} ${t.createdBy.lastName}`;
  }

  initials(first?: string, last?: string): string {
    return `${(first?.[0] ?? '').toUpperCase()}${(last?.[0] ?? '').toUpperCase()}` || '?';
  }

  slaBadge(tone?: string): 'ok' | 'warning' | 'danger' | 'neutral' {
    if (tone === 'red') return 'danger';
    if (tone === 'yellow') return 'warning';
    if (tone === 'green') return 'ok';
    return 'neutral';
  }

  setStatus(task: TaskDto, status: string): void {
    const prev = task.status;
    // Optimistic update
    this.tasks.update((list) =>
      list.map((t) => (t.id === task.id ? { ...t, status } : t)),
    );
    this.updatingId.set(task.id);
    this.api.update(task.id, { status }).subscribe({
      next: (updated) => {
        this.updatingId.set(null);
        this.tasks.update((list) =>
          list.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
        );
      },
      error: () => {
        this.updatingId.set(null);
        this.tasks.update((list) =>
          list.map((t) => (t.id === task.id ? { ...t, status: prev } : t)),
        );
        this.error.set('No se pudo actualizar el estado');
      },
    });
  }
}
