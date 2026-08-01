import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideSearch,
  LucideShield,
  LucideX,
  LucideChevronLeft,
  LucideChevronRight,
} from '@lucide/angular';
import {
  AUDIT_ACTIONS,
  AuditApiService,
  AuditLogItem,
} from '../../core/services/audit-api.service';
import { UsersApiService, AppUser } from '../../core/services/users-api.service';

type Sensitivity = 'critical' | 'high' | 'medium' | 'low';

const ACTION_SENSITIVITY: Record<string, Sensitivity> = {
  CASO_ELIMINADO: 'critical',
  DOCUMENTO_ELIMINADO: 'critical',
  CAMBIO_HONORARIOS: 'critical',
  CASO_REASIGNADO: 'high',
  TRASLADO_AREA_JURIDICA: 'high',
  CAMBIO_ESTADO_DOCUMENTO: 'high',
  CASO_CREADO: 'medium',
  CASO_ACTUALIZADO: 'medium',
  CAMBIO_ETAPA: 'medium',
  HEREDERO_CREADO: 'medium',
  HEREDERO_ACTUALIZADO: 'medium',
  HEREDERO_CONTACTADO: 'low',
  SLA_REAGENDADO: 'low',
  DOCUMENTO_CARGADO: 'low',
  NOTA_ESTRATEGICA: 'medium',
  ACTIVIDAD_REGISTRADA: 'low',
  TAREA_CREADA: 'low',
  TAREA_ACTUALIZADA: 'low',
};

@Component({
  selector: 'app-audit-trail',
  imports: [
    DatePipe,
    FormsModule,
    LucideSearch,
    LucideShield,
    LucideX,
    LucideChevronLeft,
    LucideChevronRight,
  ],
  templateUrl: './audit-trail.html',
  styleUrl: './audit-trail.css',
})
export class AuditTrailPage implements OnInit {
  private readonly api = inject(AuditApiService);
  private readonly usersApi = inject(UsersApiService);

  readonly actions = AUDIT_ACTIONS;
  readonly items = signal<AuditLogItem[]>([]);
  readonly users = signal<AppUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly totalPages = signal(1);

  readonly filterUserId = signal('');
  readonly filterAction = signal('');
  readonly filterCaseId = signal('');
  readonly filterFrom = signal('');
  readonly filterTo = signal('');

  readonly selected = signal<AuditLogItem | null>(null);
  readonly detailLoading = signal(false);

  readonly hasResults = computed(() => this.items().length > 0);
  readonly rangeLabel = computed(() => {
    const p = this.page();
    const size = this.pageSize();
    const t = this.total();
    if (!t) return '0 registros';
    const from = (p - 1) * size + 1;
    const to = Math.min(p * size, t);
    return `${from}–${to} de ${t}`;
  });

  ngOnInit(): void {
    this.usersApi.list().subscribe({
      next: (list) => this.users.set(list),
      error: () => this.users.set([]),
    });
    this.load();
  }

  load(page = this.page()): void {
    this.loading.set(true);
    this.error.set(null);
    this.page.set(page);

    this.api
      .list({
        page,
        pageSize: this.pageSize(),
        userId: this.filterUserId() || undefined,
        action: this.filterAction() || undefined,
        caseId: this.filterCaseId().trim() || undefined,
        from: this.filterFrom()
          ? new Date(this.filterFrom()).toISOString()
          : undefined,
        to: this.filterTo()
          ? new Date(`${this.filterTo()}T23:59:59`).toISOString()
          : undefined,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.totalPages.set(res.totalPages);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            err?.status === 403
              ? 'Acceso denegado: solo SUPER_ADMIN puede consultar el audit trail.'
              : 'No se pudieron cargar los registros de auditoría.',
          );
        },
      });
  }

  applyFilters(): void {
    this.load(1);
  }

  clearFilters(): void {
    this.filterUserId.set('');
    this.filterAction.set('');
    this.filterCaseId.set('');
    this.filterFrom.set('');
    this.filterTo.set('');
    this.load(1);
  }

  prevPage(): void {
    if (this.page() > 1) this.load(this.page() - 1);
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) this.load(this.page() + 1);
  }

  openDetail(row: AuditLogItem): void {
    this.selected.set(row);
    this.detailLoading.set(true);
    this.api.getById(row.id).subscribe({
      next: (full) => {
        this.selected.set(full);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailLoading.set(false);
      },
    });
  }

  closeDetail(): void {
    this.selected.set(null);
  }

  sensitivity(action: string): Sensitivity {
    return ACTION_SENSITIVITY[action] ?? 'medium';
  }

  userInitials(user: AuditLogItem['user']): string {
    if (!user) return '?';
    const a = user.firstName?.[0] ?? '';
    const b = user.lastName?.[0] ?? '';
    return (a + b).toUpperCase() || '?';
  }

  roleLabel(role: string | undefined): string {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'Super Admin';
      case 'ADMIN':
        return 'Admin';
      case 'CEO':
        return 'CEO';
      case 'DIRECTOR_JURIDICO':
        return 'Dir. Jurídico';
      case 'ASESOR':
        return 'Asesor';
      default:
        return role ?? '—';
    }
  }

  formatJson(value: unknown): string {
    if (value === null || value === undefined) {
      return '—';
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
