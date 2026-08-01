import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  Router,
} from '@angular/router';
import {
  LucideLayoutDashboard,
  LucideBriefcase,
  LucideUser,
  LucideUsers,
  LucideCheckSquare,
  LucideBarChart3,
  LucideCalendar,
  LucideFileText,
  LucideFileBarChart,
  LucideGauge,
  LucideBuilding2,
  LucideSettings,
  LucideBell,
  LucidePlus,
  LucideEraser,
  LucideLogOut,
  LucideAlertTriangle,
  LucideFilter,
  LucideShield,
  LucideGitBranch,
  LucideFolderOpen,
} from '@lucide/angular';
import { AuthService } from '../auth/auth.service';
import { navItems } from '../config/nav.config';
import { CasesApiService } from '../services/cases-api.service';
import { DashboardApiService } from '../services/dashboard-api.service';
import { DashboardStateService } from '../services/dashboard-state.service';
import { UsersApiService, AppUser } from '../services/users-api.service';

const STAGES = [
  'RECEPCION',
  'ANALISIS',
  'DOCUMENTACION',
  'VALIDACION',
  'RECLAMACION_EXTRAJUDICIAL',
  'NEGOCIACION',
  'DEMANDA',
  'PROCESO_JUDICIAL',
  'PAGO',
  'ARCHIVO',
];

const STATUSES = ['ACTIVE', 'RECOVERED', 'JUDICIAL', 'CLOSED', 'CRITICAL', 'ARCHIVED'];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    LucideLayoutDashboard,
    LucideBriefcase,
    LucideUser,
    LucideUsers,
    LucideCheckSquare,
    LucideBarChart3,
    LucideCalendar,
    LucideFileText,
    LucideFileBarChart,
    LucideGauge,
    LucideBuilding2,
    LucideSettings,
    LucideBell,
    LucidePlus,
    LucideEraser,
    LucideLogOut,
    LucideAlertTriangle,
    LucideFilter,
    LucideShield,
    LucideGitBranch,
    LucideFolderOpen,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class ShellLayout implements OnInit {
  readonly auth = inject(AuthService);
  readonly router = inject(Router);
  private readonly casesApi = inject(CasesApiService);
  private readonly dashboardApi = inject(DashboardApiService);
  readonly dashState = inject(DashboardStateService);
  private readonly usersApi = inject(UsersApiService);

  readonly nav = navItems;
  readonly caseTotal = signal<number | null>(null);
  readonly advisors = signal<AppUser[]>([]);
  readonly alertsOpen = signal(false);
  readonly stages = STAGES;
  readonly statuses = STATUSES;

  readonly overdueTasks = computed(
    () => this.dashState.summary()?.kpis.overdueTasks ?? 0,
  );
  readonly alerts = computed(() => this.dashState.summary()?.alerts ?? []);
  readonly alertCount = computed(() => this.alerts().length);

  readonly navWithBadges = computed(() => {
    const role = this.auth.user()?.role;
    return this.nav
      .filter((item) => !!role && item.roles.includes(role as never))
      .map((item) =>
        item.path === '/tasks'
          ? { ...item, badge: this.overdueTasks() || undefined }
          : item,
      );
  });

  ngOnInit(): void {
    this.casesApi.list().subscribe({
      next: (res) => this.caseTotal.set(res.total),
      error: () => this.caseTotal.set(null),
    });

    // Resumen para alertas / badge (sin filtros agresivos)
    this.dashboardApi.getSummary().subscribe({
      next: (res) => {
        if (!this.dashState.summary()) {
          this.dashState.summary.set(res);
        } else {
          // Solo actualizar alertas/KPI vencidas si ya hay summary filtrado
          const current = this.dashState.summary();
          if (current) {
            this.dashState.summary.set({
              ...current,
              alerts: res.alerts,
              kpis: {
                ...current.kpis,
                overdueTasks: res.kpis.overdueTasks,
                pendingTasks: res.kpis.pendingTasks,
              },
            });
          }
        }
      },
      error: () => undefined,
    });

    if (this.auth.isSuperAdmin()) {
      this.usersApi.list().subscribe({
        next: (users) =>
          this.advisors.set(users.filter((u) => u.role === 'ASESOR')),
        error: () => this.advisors.set([]),
      });
    }
  }

  setAdvisor(value: string): void {
    this.dashState.setFilter('advisorId', value || null);
    void this.router.navigateByUrl('/dashboard');
  }

  setStatus(value: string): void {
    this.dashState.setFilter('status', value || null);
    void this.router.navigateByUrl('/dashboard');
  }

  setStage(value: string): void {
    this.dashState.setFilter('stage', value || null);
    void this.router.navigateByUrl('/dashboard');
  }

  setAlert(value: string): void {
    this.dashState.setFilter(
      'alertLevel',
      (value as 'ALL' | 'RISK' | 'PROCESS' | 'OK') || 'ALL',
    );
    void this.router.navigateByUrl('/dashboard');
  }

  clearFilters(): void {
    this.dashState.clearFilters();
    void this.router.navigateByUrl('/dashboard');
  }

  toggleAlerts(): void {
    this.alertsOpen.update((v) => !v);
  }

  logout(): void {
    this.auth.logout();
  }

  pageTitle(): string {
    const url = this.router.url;
    if (url.startsWith('/dashboard')) return 'Dashboard';
    if (url.startsWith('/cases/new')) return 'Nuevo caso';
    if (url.startsWith('/cases/')) return 'Detalle del caso';
    if (url.startsWith('/cases')) return 'Casos';
    return 'Lex Capital';
  }

  pageSubtitle(): string {
    const url = this.router.url;
    if (url.startsWith('/dashboard')) {
      return 'Vista general del estado de los casos';
    }
    if (url.startsWith('/cases')) {
      return this.auth.isSuperAdmin()
        ? 'Gestión y seguimiento global de casos'
        : 'Mis expedientes asignados';
    }
    return 'CRM jurídico Lex Capital';
  }

  displayName(): string {
    const u = this.auth.user();
    if (!u) return 'Usuario';
    return `${u.firstName} ${u.lastName}`.trim();
  }

  roleLabel(): string {
    const role = this.auth.user()?.role;
    const map: Record<string, string> = {
      SUPER_ADMIN: 'Super Admin',
      ADMIN: 'Administrador',
      CEO: 'CEO / Super Admin',
      DIRECTOR_JURIDICO: 'Director Jurídico / Super Admin',
      ASESOR: 'Asesor',
      SOCIO: 'Socio',
    };
    return role ? (map[role] ?? role) : '';
  }

  initials(): string {
    const u = this.auth.user();
    if (!u) return 'LC';
    return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  }
}
