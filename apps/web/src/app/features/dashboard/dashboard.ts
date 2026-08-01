import {
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  LucideAlertTriangle,
  LucideBriefcase,
  LucideCheckCircle2,
  LucideClipboardList,
  LucidePlus,
  LucideStickyNote,
  LucideTrash2,
  LucideUsers,
} from '@lucide/angular';
import {
  DashboardApiService,
  DashboardSummary,
} from '../../core/services/dashboard-api.service';
import { DashboardStateService } from '../../core/services/dashboard-state.service';
import { TasksApiService } from '../../core/services/tasks-api.service';
import {
  NotesApiService,
  PersonalNote,
} from '../../core/services/notes-api.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    FormsModule,
    DatePipe,
    DecimalPipe,
    LucideAlertTriangle,
    LucideBriefcase,
    LucideCheckCircle2,
    LucideClipboardList,
    LucidePlus,
    LucideStickyNote,
    LucideTrash2,
    LucideUsers,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardPage {
  private readonly api = inject(DashboardApiService);
  private readonly tasksApi = inject(TasksApiService);
  private readonly notesApi = inject(NotesApiService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly state = inject(DashboardStateService);

  readonly error = signal<string | null>(null);
  readonly completedLocal = signal<Set<string>>(new Set());
  readonly notes = signal<PersonalNote[]>([]);
  readonly noteDrafts = signal<Record<string, string>>({});

  readonly data = computed(() => this.state.summary());
  readonly loading = computed(() => this.state.loading());
  readonly kpis = computed(() => this.data()?.kpis);
  readonly recent = computed(() => this.data()?.recentCases ?? []);
  readonly advisorRows = computed(() => this.data()?.advisors ?? []);
  readonly isAdvisor = computed(() => this.auth.user()?.role === 'ASESOR');

  readonly greeting = computed(() => {
    const u = this.auth.user();
    const name = u ? u.firstName : 'equipo';
    const h = new Date().getHours();
    const saludo =
      h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    return `${saludo}, ${name}`;
  });

  readonly urgentSummary = computed(() => {
    const k = this.kpis();
    if (!k) return 'Cargando su centro de comando…';
    if (k.overdueTasks > 0) {
      return `Tiene ${k.overdueTasks} tarea(s) vencida(s) y ${k.pendingTasks} pendientes en su cartera.`;
    }
    if (k.pendingTasks > 0) {
      return `Hoy hay ${k.pendingTasks} tarea(s) abiertas. Su tasa de éxito va en ${k.successRate}%.`;
    }
    return 'Sin urgencias críticas. Buen momento para avanzar casos en gestión.';
  });

  /** Triage: solo rojo / amarillo */
  readonly triage = computed(() => {
    const done = this.completedLocal();
    return (this.data()?.tasks ?? [])
      .filter(
        (t) =>
          !done.has(t.id) &&
          (t.overdue || t.slaTone === 'red' || t.slaTone === 'yellow'),
      )
      .slice(0, 12)
      .map((t) => ({
        ...t,
        done: false,
        tone: t.slaTone ?? (t.overdue ? 'red' : 'yellow'),
      }));
  });

  readonly todayTasks = computed(() => {
    const k = this.kpis();
    return k?.pendingTasks ?? 0;
  });

  readonly performancePct = computed(() => this.kpis()?.successRate ?? 0);

  private reloadToken = 0;

  constructor() {
    effect(() => {
      const f = this.state.filters();
      void f;
      if (this.auth.isAuthenticated()) {
        this.load();
      }
    });
  }

  load(): void {
    const token = ++this.reloadToken;
    this.state.loading.set(true);
    this.error.set(null);
    this.api.getSummary(this.state.filters()).subscribe({
      next: (res: DashboardSummary) => {
        if (token !== this.reloadToken) return;
        this.state.summary.set(res);
        this.state.loading.set(false);
      },
      error: () => {
        if (token !== this.reloadToken) return;
        this.state.loading.set(false);
        this.error.set('No se pudo cargar el dashboard');
      },
    });
    this.loadNotes();
  }

  loadNotes(): void {
    this.notesApi.list().subscribe({
      next: (list) => {
        this.notes.set(list);
        const drafts: Record<string, string> = {};
        for (const n of list) drafts[n.id] = n.contenido;
        this.noteDrafts.set(drafts);
      },
      error: () => this.notes.set([]),
    });
  }

  toggleTask(id: string): void {
    const next = new Set(this.completedLocal());
    next.add(id);
    this.completedLocal.set(next);
    this.tasksApi.update(id, { status: 'COMPLETED' }).subscribe({
      error: () => {
        const rollback = new Set(this.completedLocal());
        rollback.delete(id);
        this.completedLocal.set(rollback);
      },
      next: () => {
        // refrescar KPI sin bloquear UI
        this.api.getSummary(this.state.filters()).subscribe({
          next: (res) => this.state.summary.set(res),
        });
      },
    });
  }

  addNote(): void {
    this.notesApi.create({ contenido: '' }).subscribe({
      next: (n) => {
        this.notes.update((list) => [n, ...list]);
        this.noteDrafts.update((d) => ({ ...d, [n.id]: '' }));
      },
    });
  }

  onNoteInput(id: string, value: string): void {
    this.noteDrafts.update((d) => ({ ...d, [id]: value }));
  }

  saveNote(id: string): void {
    const contenido = this.noteDrafts()[id] ?? '';
    this.notesApi.update(id, { contenido }).subscribe({
      next: (n) => {
        this.notes.update((list) =>
          list.map((x) => (x.id === id ? n : x)),
        );
      },
    });
  }

  removeNote(id: string): void {
    this.notesApi.remove(id).subscribe({
      next: () => {
        this.notes.update((list) => list.filter((n) => n.id !== id));
        this.noteDrafts.update((d) => {
          const copy = { ...d };
          delete copy[id];
          return copy;
        });
      },
    });
  }

  openCase(id: string): void {
    void this.router.navigateByUrl(`/cases/${id}`);
  }

  formatMillions(value: number): string {
    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(1)}B`;
    }
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    }
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value);
  }
}
