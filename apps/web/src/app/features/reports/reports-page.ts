import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideBriefcase,
  LucideCheckCircle2,
  LucideClipboardList,
  LucideAlertTriangle,
  LucideRefreshCw,
  LucideFileBarChart,
  LucideLoaderCircle,
} from '@lucide/angular';
import { AuthService } from '../../core/auth/auth.service';
import {
  ReportsApiService,
  ReportsPerformance,
} from '../../core/services/reports-api.service';

@Component({
  selector: 'app-reports-page',
  imports: [
    FormsModule,
    RouterLink,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    LucideBriefcase,
    LucideCheckCircle2,
    LucideClipboardList,
    LucideAlertTriangle,
    LucideRefreshCw,
    LucideFileBarChart,
    LucideLoaderCircle,
  ],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.css',
})
export class ReportsPage implements OnInit {
  private readonly api = inject(ReportsApiService);
  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly data = signal<ReportsPerformance | null>(null);
  /** Solo managers: filtro de asesor */
  readonly advisorFilter = signal('');

  readonly isManager = computed(() => this.auth.isSuperAdmin());
  readonly kpis = computed(() => this.data()?.kpis ?? null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const advisorId = this.isManager()
      ? this.advisorFilter() || null
      : null;
    this.api.performance(advisorId).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string }; status?: number }) => {
        this.loading.set(false);
        this.error.set(
          err?.status === 403
            ? 'No autorizado a ver reportes.'
            : err?.error?.message ?? 'No se pudo cargar el reporte',
        );
      },
    });
  }

  onAdvisorChange(id: string): void {
    this.advisorFilter.set(id);
    this.load();
  }
}
