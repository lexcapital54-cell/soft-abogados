import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import {
  LucideCheck,
  LucideUpload,
  LucideX,
  LucideSparkles,
  LucideGitBranch,
  LucideLoaderCircle,
  LucideFileSpreadsheet,
} from '@lucide/angular';
import {
  KinshipApiService,
  KinshipAnalyzeResult,
  KinshipGraphPayload,
  KinshipRelation,
} from '../../core/services/kinship-api.service';
import { CasesApiService } from '../../core/services/cases-api.service';
import { parseDataFile, ParsedSheet } from '../../core/utils/file-parse';
import { KinshipGraphComponent } from './kinship-graph';

type Decision = 'pending' | 'validated' | 'discarded';

@Component({
  selector: 'app-kinship-matching',
  imports: [
    FormsModule,
    DecimalPipe,
    KinshipGraphComponent,
    LucideCheck,
    LucideUpload,
    LucideX,
    LucideSparkles,
    LucideGitBranch,
    LucideLoaderCircle,
    LucideFileSpreadsheet,
  ],
  templateUrl: './kinship-matching.html',
  styleUrl: './kinship-matching.css',
})
export class KinshipMatchingPage implements OnInit {
  private readonly api = inject(KinshipApiService);
  private readonly casesApi = inject(CasesApiService);

  readonly aiAvailable = signal(false);
  readonly useAi = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);

  readonly baseA = signal<ParsedSheet | null>(null);
  readonly baseB = signal<ParsedSheet | null>(null);
  readonly result = signal<KinshipAnalyzeResult | null>(null);
  readonly selected = signal<KinshipRelation | null>(null);
  readonly graph = signal<KinshipGraphPayload | null>(null);
  readonly decisions = signal<Record<string, Decision>>({});
  readonly cases = signal<Array<{ id: string; internalCode: string; deceased?: { fullName: string } }>>([]);
  readonly caseId = signal('');
  readonly validatingId = signal<string | null>(null);

  readonly pendingRelations = computed(() => {
    const rels = this.result()?.relations ?? [];
    const dec = this.decisions();
    return rels.filter((r) => (dec[r.id] ?? 'pending') === 'pending');
  });

  readonly highlightIds = computed(() => {
    const s = this.selected();
    return s ? [s.titularId, s.familiarId] : [];
  });

  ngOnInit(): void {
    this.api.aiStatus().subscribe({
      next: (s) => this.aiAvailable.set(s.available),
      error: () => this.aiAvailable.set(false),
    });
    this.casesApi.list({ pageSize: 100 }).subscribe({
      next: (res) =>
        this.cases.set(
          res.items.map((i) => ({
            id: i.id,
            internalCode: i.internalCode,
            deceased: i.deceased,
          })),
        ),
      error: () => this.cases.set([]),
    });
  }

  async onFileA(ev: Event): Promise<void> {
    await this.loadFile(ev, 'A');
  }

  async onFileB(ev: Event): Promise<void> {
    await this.loadFile(ev, 'B');
  }

  private async loadFile(ev: Event, which: 'A' | 'B'): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);
    try {
      const parsed = await parseDataFile(file);
      if (which === 'A') this.baseA.set(parsed);
      else this.baseB.set(parsed);
      this.result.set(null);
      this.selected.set(null);
      this.graph.set(null);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo leer el archivo');
    }
  }

  runAnalysis(): void {
    const a = this.baseA();
    const b = this.baseB();
    if (!a?.rows.length || !b?.rows.length) {
      this.error.set('Cargue ambas bases de datos (titulares y candidatos).');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.analyze(a.rows, b.rows, this.useAi() && this.aiAvailable()).subscribe({
      next: (res) => {
        this.result.set(res);
        this.decisions.set({});
        this.loading.set(false);
        this.showToast(
          `${res.stats.matches} hallazgos · confianza media ${res.stats.avgConfidence}%${
            res.stats.usedAi ? ' · IA activa' : ' · motor heurístico'
          }`,
        );
        if (res.relations[0]) this.selectRelation(res.relations[0]);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.loading.set(false);
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg)
            ? msg.join(', ')
            : typeof msg === 'string'
              ? msg
              : 'No se pudo ejecutar el cruce',
        );
      },
    });
  }

  selectRelation(rel: KinshipRelation): void {
    this.selected.set(rel);
    const res = this.result();
    if (!res) return;
    this.api.graph(res.titulares, res.candidatos, rel).subscribe({
      next: (g) => this.graph.set(g),
      error: () =>
        this.graph.set({
          nodes: [
            {
              id: rel.titular.id,
              label: rel.titular.fullName,
              cedula: rel.titular.cedula,
              anioNacimiento: rel.titular.anioNacimiento,
              source: 'TITULAR',
              x: 220,
              y: 60,
            },
            {
              id: rel.familiar.id,
              label: rel.familiar.fullName,
              cedula: rel.familiar.cedula,
              anioNacimiento: rel.familiar.anioNacimiento,
              source: 'CANDIDATO',
              x: 520,
              y: 200,
            },
          ],
          edges: [
            {
              id: 'fallback',
              source: rel.titular.id,
              target: rel.familiar.id,
              degree: rel.degree,
              label: `${rel.degree}°`,
            },
          ],
        }),
    });
  }

  discard(rel: KinshipRelation): void {
    this.decisions.update((d) => ({ ...d, [rel.id]: 'discarded' }));
    if (this.selected()?.id === rel.id) {
      this.selected.set(null);
      this.graph.set(null);
    }
    this.showToast(`Descartado: ${rel.familiar.fullName}`);
  }

  validate(rel: KinshipRelation): void {
    const caseId = this.caseId();
    if (!caseId) {
      this.error.set('Seleccione un caso destino para consolidar el parentesco.');
      return;
    }
    this.validatingId.set(rel.id);
    this.api
      .validate({
        caseId,
        fullName: rel.familiar.fullName,
        kinship: this.toKinshipEnum(rel.label),
        documentNumber: rel.familiar.cedula ?? undefined,
        city: rel.familiar.ciudadNacimiento ?? undefined,
        observations: `Cruce IA · ${rel.labelDisplay} · confianza ${rel.confidence}% · ${rel.reasons.join('; ')}`,
        relationId: rel.id,
      })
      .subscribe({
        next: () => {
          this.validatingId.set(null);
          this.decisions.update((d) => ({ ...d, [rel.id]: 'validated' }));
          this.showToast(`Validado en expediente: ${rel.familiar.fullName}`);
        },
        error: (err: { error?: { message?: string } }) => {
          this.validatingId.set(null);
          this.error.set(err?.error?.message ?? 'No se pudo consolidar el familiar');
        },
      });
  }

  degreeClass(degree: number): string {
    if (degree === 1) return 'd1';
    if (degree === 2) return 'd2';
    return 'd3';
  }

  decisionOf(id: string): Decision {
    return this.decisions()[id] ?? 'pending';
  }

  private toKinshipEnum(label: string): string {
    const map: Record<string, string> = {
      PADRE: 'PADRE',
      MADRE: 'MADRE',
      HIJO: 'HIJO',
      HIJA: 'HIJA',
      HERMANO: 'HERMANO',
      HERMANA: 'HERMANA',
      NIETO: 'NIETO',
      NIETA: 'NIETA',
      ABUELO: 'OTRO',
      ABUELA: 'OTRO',
      TIO: 'OTRO',
      TIA: 'OTRO',
      SOBRINO: 'OTRO',
      SOBRINA: 'OTRO',
    };
    return map[label] ?? 'OTRO';
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 3200);
  }
}
