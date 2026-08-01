import { Injectable, signal } from '@angular/core';
import type { DashboardFilters, DashboardSummary } from './dashboard-api.service';

/** Estado compartido entre shell (filtros/alertas) y página Dashboard */
@Injectable({ providedIn: 'root' })
export class DashboardStateService {
  readonly filters = signal<DashboardFilters>({
    advisorId: null,
    status: null,
    stage: null,
    alertLevel: 'ALL',
  });

  readonly summary = signal<DashboardSummary | null>(null);
  readonly loading = signal(false);

  setFilter<K extends keyof DashboardFilters>(
    key: K,
    value: DashboardFilters[K],
  ): void {
    this.filters.update((f) => ({ ...f, [key]: value || null }));
  }

  clearFilters(): void {
    this.filters.set({
      advisorId: null,
      status: null,
      stage: null,
      alertLevel: 'ALL',
    });
  }
}
