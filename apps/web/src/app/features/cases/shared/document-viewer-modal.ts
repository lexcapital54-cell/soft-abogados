import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import {
  LucideCheckCircle,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDownload,
  LucideLoaderCircle,
  LucideMaximize2,
  LucideRotateCw,
  LucideX,
  LucideZoomIn,
  LucideZoomOut,
  LucideAlertTriangle,
  LucideFileText,
} from '@lucide/angular';
import {
  CaseDocument,
  DocumentsApiService,
} from '../../../core/services/documents-api.service';

/** Worker en public/assets — Worker nativo (evita import dinámico de Vite) */
if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
  GlobalWorkerOptions.workerPort = new Worker(
    new URL('/assets/pdfjs/pdf.worker.min.mjs', window.location.origin),
    { type: 'module' },
  );
} else {
  GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs';
}

@Component({
  selector: 'app-document-viewer-modal',
  imports: [
    DecimalPipe,
    LucideCheckCircle,
    LucideChevronLeft,
    LucideChevronRight,
    LucideDownload,
    LucideLoaderCircle,
    LucideMaximize2,
    LucideRotateCw,
    LucideX,
    LucideZoomIn,
    LucideZoomOut,
    LucideAlertTriangle,
    LucideFileText,
  ],
  templateUrl: './document-viewer-modal.html',
  styleUrl: './document-viewer-modal.css',
})
export class DocumentViewerModalComponent implements OnChanges, OnDestroy {
  private readonly docsApi = inject(DocumentsApiService);

  /** Documento a previsualizar; null cierra el modal */
  @Input() document: CaseDocument | null = null;
  @Input() caseCode = '';
  @Input() caseId = '';
  @Input() canApprove = false;
  @Input() canDownload = true;

  @Output() closed = new EventEmitter<void>();
  @Output() approved = new EventEmitter<CaseDocument>();
  @Output() rejected = new EventEmitter<CaseDocument>();

  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  readonly loading = signal(true);
  readonly rendering = signal(false);
  readonly error = signal<string | null>(null);
  readonly page = signal(1);
  readonly numPages = signal(0);
  readonly scale = signal(1.15);
  readonly rotation = signal(0);
  readonly acting = signal(false);
  readonly isPdf = signal(true);
  readonly imageUrl = signal<string | null>(null);
  readonly hasBlob = signal(false);
  readonly blobReady = computed(() => this.hasBlob() && this.canDownload);

  private pdf: PDFDocumentProxy | null = null;
  private objectUrl: string | null = null;
  private blob: Blob | null = null;
  private renderToken = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['document']) {
      void this.bootstrap();
    }
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  get open(): boolean {
    return !!this.document;
  }

  get title(): string {
    const doc = this.document;
    if (!doc) return '';
    const type = doc.documentType?.name || doc.name;
    const code = this.caseCode ? ` · ${this.caseCode}` : '';
    return `${type}${code}`;
  }

  get fileName(): string {
    return (
      this.document?.originalFileName ||
      this.document?.name ||
      'documento'
    );
  }

  canReviewStatus(): boolean {
    const s = this.document?.status;
    return s === 'CARGADO' || s === 'EN_REVISION';
  }

  close(): void {
    this.teardown();
    this.closed.emit();
  }

  async zoomIn(): Promise<void> {
    this.scale.update((s) => Math.min(3, +(s + 0.15).toFixed(2)));
    await this.renderPage();
  }

  async zoomOut(): Promise<void> {
    this.scale.update((s) => Math.max(0.5, +(s - 0.15).toFixed(2)));
    await this.renderPage();
  }

  async fitWidth(): Promise<void> {
    this.scale.set(1.15);
    await this.renderPage();
  }

  async rotate(): Promise<void> {
    this.rotation.update((r) => (r + 90) % 360);
    if (this.isPdf()) {
      await this.renderPage();
    }
  }

  async prevPage(): Promise<void> {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    await this.renderPage();
  }

  async nextPage(): Promise<void> {
    if (this.page() >= this.numPages()) return;
    this.page.update((p) => p + 1);
    await this.renderPage();
  }

  download(): void {
    if (!this.canDownload || !this.blob) return;
    const url = URL.createObjectURL(this.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  approve(): void {
    const doc = this.document;
    if (!doc || !this.canApprove || this.acting()) return;
    this.acting.set(true);
    this.docsApi.updateStatus(doc.id, 'APROBADO').subscribe({
      next: () => {
        this.acting.set(false);
        this.approved.emit({ ...doc, status: 'APROBADO' });
        this.close();
      },
      error: (err: { error?: { message?: string }; status?: number }) => {
        this.acting.set(false);
        this.error.set(
          err?.status === 403
            ? 'Sin permiso para aprobar este documento.'
            : err?.error?.message ?? 'No se pudo aprobar el documento.',
        );
      },
    });
  }

  reject(): void {
    const doc = this.document;
    if (!doc || !this.canApprove || this.acting()) return;
    this.acting.set(true);
    this.docsApi.updateStatus(doc.id, 'RECHAZADO').subscribe({
      next: () => {
        this.acting.set(false);
        this.rejected.emit({ ...doc, status: 'RECHAZADO' });
        this.close();
      },
      error: (err: { error?: { message?: string }; status?: number }) => {
        this.acting.set(false);
        this.error.set(
          err?.status === 403
            ? 'Sin permiso para rechazar este documento.'
            : err?.error?.message ?? 'No se pudo rechazar el documento.',
        );
      },
    });
  }

  private async bootstrap(): Promise<void> {
    this.teardown();
    const doc = this.document;
    if (!doc) return;

    this.loading.set(true);
    this.error.set(null);
    this.page.set(1);
    this.numPages.set(0);
    this.rotation.set(0);
    this.scale.set(1.15);

    try {
      const res = await new Promise<{
        blob: Blob;
        contentType: string | null;
      }>((resolve, reject) => {
        this.docsApi.fetchBlob(doc).subscribe({
          next: (response) => {
            resolve({
              blob: response.body as Blob,
              contentType: response.headers.get('content-type'),
            });
          },
          error: (err: { status?: number; error?: { message?: string } }) => {
            if (err?.status === 401 || err?.status === 403) {
              reject(
                new Error(
                  'Sesión sin permiso o caducada. Vuelva a iniciar sesión.',
                ),
              );
            } else if (err?.status === 404) {
              reject(
                new Error(
                  'Archivo no encontrado o URL firmada caducada.',
                ),
              );
            } else {
              reject(
                new Error(
                  err?.error?.message ??
                    'No se pudo obtener el documento desde el almacenamiento.',
                ),
              );
            }
          },
        });
      });

      this.blob = res.blob;
      this.hasBlob.set(true);
      const mime =
        res.contentType ||
        doc.mimeType ||
        res.blob.type ||
        '';
      const looksImage =
        mime.startsWith('image/') ||
        /\.(jpe?g|png|webp)$/i.test(doc.originalFileName || doc.name);

      if (looksImage) {
        this.isPdf.set(false);
        this.objectUrl = URL.createObjectURL(res.blob);
        this.imageUrl.set(this.objectUrl);
        this.loading.set(false);
        return;
      }

      this.isPdf.set(true);
      const data = await res.blob.arrayBuffer();
      this.pdf = await getDocument({ data }).promise;
      this.numPages.set(this.pdf.numPages);
      this.loading.set(false);
      // Espera al canvas en el DOM
      queueMicrotask(() => void this.renderPage());
    } catch (e) {
      this.loading.set(false);
      this.error.set(
        e instanceof Error ? e.message : 'Error al cargar el expediente.',
      );
    }
  }

  private async renderPage(): Promise<void> {
    if (!this.pdf || !this.isPdf()) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      // Reintento corto si el ViewChild aún no está listo
      setTimeout(() => void this.renderPage(), 30);
      return;
    }

    const token = ++this.renderToken;
    this.rendering.set(true);
    try {
      const pdfPage = await this.pdf.getPage(this.page());
      if (token !== this.renderToken) return;

      const viewport = pdfPage.getViewport({
        scale: this.scale(),
        rotation: this.rotation(),
      });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pdfPage.render({
        canvasContext: ctx,
        viewport,
      }).promise;
    } catch {
      if (token === this.renderToken) {
        this.error.set('No se pudo renderizar la página del PDF.');
      }
    } finally {
      if (token === this.renderToken) this.rendering.set(false);
    }
  }

  private teardown(): void {
    this.renderToken++;
    if (this.pdf) {
      void this.pdf.destroy();
      this.pdf = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.imageUrl.set(null);
    this.blob = null;
    this.hasBlob.set(false);
    this.numPages.set(0);
    this.error.set(null);
  }
}
