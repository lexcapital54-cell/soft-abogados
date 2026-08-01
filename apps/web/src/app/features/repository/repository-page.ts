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
    const token = this.auth.token();
    const url = this.api.fileUrl(doc.id);
    // Abrir con auth via fetch blob
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error('download');
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = doc.nombre.endsWith('.pdf') ? doc.nombre : `${doc.nombre}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => this.error.set('No se pudo descargar el archivo'));
  }

  remove(doc: RepoDocument): void {
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
