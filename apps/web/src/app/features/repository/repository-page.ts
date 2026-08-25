import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideFolderOpen,
  LucideUpload,
  LucideRefreshCw,
  LucideLoaderCircle,
  LucideDownload,
  LucideTrash2,
} from '@lucide/angular';
import {
  RepoCategoria,
  RepoDocument,
  RepositoryApiService,
} from '../../core/services/repository-api.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-repository-page',
  imports: [
    FormsModule,
    DatePipe,
    LucideFolderOpen,
    LucideUpload,
    LucideRefreshCw,
    LucideLoaderCircle,
    LucideDownload,
    LucideTrash2,
  ],
  templateUrl: './repository-page.html',
  styleUrl: './repository-page.css',
})
export class RepositoryPage implements OnInit {
  private readonly api = inject(RepositoryApiService);
  readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  readonly items = signal<RepoDocument[]>([]);
  readonly filterCat = signal('');
  readonly search = signal('');

  nombre = '';
  categoria: RepoCategoria = 'PLANTILLA';
  selectedFile: File | null = null;
  dragOver = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .list({
        categoria: this.filterCat() || undefined,
        search: this.search() || undefined,
      })
      .subscribe({
        next: (list) => {
          this.items.set(list);
          this.loading.set(false);
        },
        error: (err: { error?: { message?: string } }) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'No se pudo cargar el repositorio');
        },
      });
  }

  onFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
    if (this.selectedFile && !this.nombre) {
      this.nombre = this.selectedFile.name.replace(/\.pdf$/i, '');
    }
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver = false;
    const file = ev.dataTransfer?.files?.[0];
    if (file) {
      this.selectedFile = file;
      if (!this.nombre) this.nombre = file.name.replace(/\.pdf$/i, '');
    }
  }

  upload(): void {
    if (!this.auth.isSuperAdmin()) {
      this.error.set('Solo dirección puede subir documentos corporativos');
      return;
    }
    if (!this.selectedFile) {
      this.error.set('Seleccione un archivo PDF');
      return;
    }
    if (!this.nombre.trim()) {
      this.error.set('Indique el nombre del documento');
      return;
    }
    this.uploading.set(true);
    this.error.set(null);
    this.api.upload(this.selectedFile, this.nombre.trim(), this.categoria).subscribe({
      next: () => {
        this.uploading.set(false);
        this.selectedFile = null;
        this.nombre = '';
        this.toast.set('Documento corporativo subido');
        setTimeout(() => this.toast.set(null), 3000);
        this.load();
      },
      error: (err: { error?: { message?: string } }) => {
        this.uploading.set(false);
        this.error.set(err?.error?.message ?? 'Error al subir');
      },
    });
  }

  download(doc: RepoDocument): void {
    this.error.set(null);
    // 1) URL firmada (más fiable para asesores / CORS)
    this.api.signedUrl(doc.id).subscribe({
      next: ({ url, filename }) => {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.download = filename || doc.nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
      error: () => {
        // 2) Fallback: proxy autenticado por la API
        this.api.downloadBlob(doc.id).subscribe({
          next: (blob) => {
            if (blob.type?.includes('json')) {
              this.error.set('No se pudo descargar el archivo desde storage');
              return;
            }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = /\.[a-z0-9]+$/i.test(doc.nombre)
              ? doc.nombre
              : `${doc.nombre}.pdf`;
            a.click();
            URL.revokeObjectURL(a.href);
          },
          error: () =>
            this.error.set(
              'No se pudo descargar. Verifique que Supabase Storage esté configurado en la API.',
            ),
        });
      },
    });
  }

  remove(doc: RepoDocument): void {
    if (!this.auth.isSuperAdmin()) return;
    if (!confirm(`¿Desactivar "${doc.nombre}" del repositorio?`)) return;
    this.api.deactivate(doc.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('No se pudo desactivar'),
    });
  }

  kb(size?: number | null): string {
    if (!size) return '—';
    return `${Math.round(size / 1024)} KB`;
  }
}
