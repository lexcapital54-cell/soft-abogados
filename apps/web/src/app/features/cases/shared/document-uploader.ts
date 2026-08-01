import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideUpload,
  LucideFileUp,
  LucideAlertTriangle,
  LucideCheckCircle,
  LucideLoaderCircle,
} from '@lucide/angular';
import { DocumentsApiService } from '../../../core/services/documents-api.service';

@Component({
  selector: 'app-document-uploader',
  imports: [
    FormsModule,
    LucideUpload,
    LucideFileUp,
    LucideAlertTriangle,
    LucideCheckCircle,
    LucideLoaderCircle,
  ],
  templateUrl: './document-uploader.html',
  styleUrl: './document-uploader.css',
})
export class DocumentUploaderComponent {
  @Input({ required: true }) caseId!: string;
  @Input() disabled = false;
  @Output() uploaded = new EventEmitter<void>();

  readonly dragOver = signal(false);
  readonly progress = signal(0);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  tipoDocumento = 'Registro Civil';

  constructor(private readonly api: DocumentsApiService) {}

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled) this.dragOver.set(true);
  }

  onDragLeave(): void {
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    if (this.disabled) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.startUpload(file);
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.startUpload(file);
    input.value = '';
  }

  private startUpload(file: File): void {
    this.error.set(null);
    this.success.set(null);

    if (!this.caseId) {
      this.error.set('Caso no válido para carga documental.');
      return;
    }

    const max = 15 * 1024 * 1024;
    if (file.size > max) {
      this.error.set('El archivo supera 15 MB.');
      return;
    }

    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (file.type && !allowed.includes(file.type)) {
      this.error.set('Formato no permitido (PDF, imagen o Word).');
      return;
    }

    if (!this.tipoDocumento.trim()) {
      this.error.set('Indique el tipo de documento.');
      return;
    }

    this.uploading.set(true);
    this.progress.set(0);

    this.api.upload(this.caseId, file, this.tipoDocumento.trim()).subscribe({
      next: (ev: { progress: number; done: boolean; result?: unknown }) => {
        this.progress.set(ev.progress);
        if (ev.done) {
          this.uploading.set(false);
          const result = ev.result as { folderPath?: string } | undefined;
          this.success.set(
            `Cargado en ${result?.folderPath ?? 'storage'} · Estado: Cargado`,
          );
          this.uploaded.emit();
        }
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.uploading.set(false);
        this.progress.set(0);
        const msg =
          err?.error?.message ??
          (Array.isArray(err?.error?.message)
            ? err.error.message.join(', ')
            : null);
        this.error.set(
          typeof msg === 'string'
            ? msg
            : 'No se pudo subir el archivo. Verifique la API.',
        );
      },
    });
  }
}
