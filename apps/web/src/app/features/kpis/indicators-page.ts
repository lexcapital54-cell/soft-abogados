import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  LineController,
  LineElement,
  PointElement,
  ArcElement,
  DoughnutController,
  Filler,
} from 'chart.js';
import {
  LucideGauge,
  LucideRefreshCw,
  LucideLoaderCircle,
  LucideX,
  LucideBriefcase,
  LucideAlertTriangle,
  LucideTrendingUp,
  LucideEye,
} from '@lucide/angular';
import {
  AdvisorKpiDetail,
  KpisApiService,
  KpisSummary,
} from '../../core/services/kpis-api.service';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  LineController,
  LineElement,
  PointElement,
  ArcElement,
  DoughnutController,
  Filler,
);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-indicators-page',
  imports: [
    FormsModule,
    RouterLink,
    DatePipe,
    DecimalPipe,
    LucideGauge,
    LucideRefreshCw,
    LucideLoaderCircle,
    LucideX,
    LucideBriefcase,
    LucideAlertTriangle,
    LucideTrendingUp,
    LucideEye,
  ],
  templateUrl: './indicators-page.html',
  styleUrl: './indicators-page.css',
})
export class IndicatorsPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(KpisApiService);

  @ViewChild('slaCanvas') slaCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('burnCanvas') burnCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('donutCanvas') donutCanvas?: ElementRef<HTMLCanvasElement>;

  private slaChart: Chart | null = null;
  private burnChart: Chart | null = null;
  private donutChart: Chart | null = null;
  private viewReady = false;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly data = signal<KpisSummary | null>(null);

  readonly from = signal(isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly to = signal(isoDate(new Date()));
  readonly advisorId = signal('');

  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);
  readonly detail = signal<AdvisorKpiDetail | null>(null);
  readonly detailError = signal<string | null>(null);

  readonly scorecards = computed(() => this.data()?.scorecards ?? null);
  readonly leaderboard = computed(() => this.data()?.leaderboard ?? []);

  constructor() {
    effect(() => {
      const d = this.data();
      if (d && this.viewReady) {
        queueMicrotask(() => this.renderCharts(d));
      }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    const d = this.data();
    if (d) this.renderCharts(d);
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .summary({
        from: this.from(),
        to: this.to(),
        advisorId: this.advisorId() || null,
      })
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
        },
        error: (err: { error?: { message?: string }; status?: number }) => {
          this.loading.set(false);
          this.error.set(
            err?.status === 403
              ? 'Solo SUPER_ADMIN puede ver Indicadores.'
              : err?.error?.message ?? 'No se pudieron cargar los KPIs',
          );
        },
      });
  }

  applyFilters(): void {
    this.load();
  }

  deltaClass(delta: number): string {
    if (delta > 0) return 'up';
    if (delta < 0) return 'down';
    return 'flat';
  }

  openDetail(advisorId: string): void {
    this.detailOpen.set(true);
    this.detail.set(null);
    this.detailError.set(null);
    this.detailLoading.set(true);
    this.api
      .advisorDetail(advisorId, { from: this.from(), to: this.to() })
      .subscribe({
        next: (res) => {
          this.detail.set(res);
          this.detailLoading.set(false);
        },
        error: (err: { error?: { message?: string } }) => {
          this.detailLoading.set(false);
          this.detailError.set(
            err?.error?.message ?? 'No se pudo cargar el detalle',
          );
        },
      });
  }

  closeDetail(): void {
    this.detailOpen.set(false);
  }

  private destroyCharts(): void {
    this.slaChart?.destroy();
    this.burnChart?.destroy();
    this.donutChart?.destroy();
    this.slaChart = null;
    this.burnChart = null;
    this.donutChart = null;
  }

  private renderCharts(d: KpisSummary): void {
    if (!this.slaCanvas || !this.burnCanvas || !this.donutCanvas) return;
    this.destroyCharts();

    const names = d.slaByAdvisor.map((a) => a.name.split(' ')[0] + ' ' + (a.name.split(' ')[1] ?? ''));
    this.slaChart = new Chart(this.slaCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: names,
        datasets: [
          {
            label: 'A tiempo (verde)',
            data: d.slaByAdvisor.map((a) => a.onTime),
            backgroundColor: '#10b981',
            stack: 'sla',
          },
          {
            label: 'Tarde / vencido (rojo)',
            data: d.slaByAdvisor.map((a) => a.late),
            backgroundColor: '#f43f5e',
            stack: 'sla',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });

    this.burnChart = new Chart(this.burnCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: d.burnDown.map((b) => b.date.slice(5)),
        datasets: [
          {
            label: 'Tareas completadas',
            data: d.burnDown.map((b) => b.completed),
            borderColor: '#0b132b',
            backgroundColor: 'rgba(197, 168, 102, 0.25)',
            fill: true,
            tension: 0.35,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });

    const stageColors = [
      '#0b132b',
      '#c5a866',
      '#10b981',
      '#f59e0b',
      '#f43f5e',
      '#6366f1',
      '#14b8a6',
      '#8b5cf6',
      '#64748b',
      '#94a3b8',
    ];
    this.donutChart = new Chart(this.donutCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels: d.casesByStage.map((s) => s.label),
        datasets: [
          {
            data: d.casesByStage.map((s) => s.count),
            backgroundColor: d.casesByStage.map(
              (_, i) => stageColors[i % stageColors.length],
            ),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right' } },
      },
    });
  }
}
