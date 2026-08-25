import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { Readable as NodeReadable } from 'node:stream';

export type StoredObject = {
  /** Ruta relativa: casos/CEDULA_NOMBRE/archivo.pdf */
  storageKey: string;
  /** URL pública o URL de la API para descargar */
  storageUrl: string;
};

export type OpenedObject =
  | { kind: 'stream'; stream: Readable; mimeHint?: string }
  | { kind: 'redirect'; url: string };

type StorageDriver = 'local' | 'supabase';

/**
 * Storage documental.
 * - local: disco (OK en Mac/local; en Render el disco es efímero)
 * - supabase: bucket persistente (recomendado en producción cloud)
 *
 * Variables:
 *   STORAGE_DRIVER=local|supabase
 *   STORAGE_ROOT=...
 *   STORAGE_PUBLIC_BASE=...
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   SUPABASE_STORAGE_BUCKET=lexcapital-docs
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  private readonly root: string;
  private readonly publicBase: string;
  private readonly supabaseUrl: string | null;
  private readonly supabaseKey: string | null;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const raw = (this.config.get<string>('STORAGE_DRIVER') ?? 'local')
      .trim()
      .toLowerCase();
    this.driver = raw === 'supabase' ? 'supabase' : 'local';

    this.root =
      this.config.get<string>('STORAGE_ROOT') ??
      join(process.cwd(), 'storage');

    const apiPrefix = this.config.get<string>('API_PREFIX') ?? 'api/v1';
    const port =
      this.config.get<string>('API_PORT') ??
      this.config.get<string>('PORT') ??
      '3000';
    this.publicBase =
      this.config.get<string>('STORAGE_PUBLIC_BASE') ??
      `http://localhost:${port}/${apiPrefix}/documents/file`;

    this.supabaseUrl = this.config.get<string>('SUPABASE_URL')?.replace(
      /\/$/,
      '',
    ) ?? null;
    this.supabaseKey =
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ?? null;
    this.bucket =
      this.config.get<string>('SUPABASE_STORAGE_BUCKET') ?? 'lexcapital-docs';

    if (this.driver === 'local' && process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'STORAGE_DRIVER=local en producción: los archivos pueden perderse al reiniciar (disco efímero en Render). Configure Supabase Storage.',
      );
    }

    if (this.driver === 'supabase') {
      if (!this.supabaseUrl || !this.supabaseKey) {
        this.logger.error(
          'STORAGE_DRIVER=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY',
        );
      } else {
        this.logger.log(
          `Storage Supabase activo → bucket "${this.bucket}"`,
        );
      }
    }
  }

  getRoot(): string {
    return this.root;
  }

  getDriver(): StorageDriver {
    return this.driver;
  }

  async save(
    folderPath: string,
    fileName: string,
    buffer: Buffer,
  ): Promise<StoredObject> {
    const folder = folderPath.replace(/^\/+|\/+$/g, '');
    const rawKey = `${folder}/${fileName}`.replace(/\\/g, '/');
    const storageKey = this.sanitizeKey(rawKey);

    if (this.driver === 'supabase') {
      return this.saveSupabase(storageKey, buffer);
    }
    return this.saveLocal(
      storageKey.includes('/') ? storageKey.slice(0, storageKey.lastIndexOf('/')) : '',
      storageKey.includes('/') ? storageKey.slice(storageKey.lastIndexOf('/') + 1) : storageKey,
      storageKey,
      buffer,
    );
  }

  private sanitizeKey(key: string): string {
    return key
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._/-]+/g, '_');
  }

  private async saveLocal(
    folder: string,
    fileName: string,
    storageKey: string,
    buffer: Buffer,
  ): Promise<StoredObject> {
    const absoluteDir = join(this.root, folder);
    await mkdir(absoluteDir, { recursive: true });
    await writeFile(join(absoluteDir, fileName), buffer);

    return {
      storageKey,
      storageUrl: `${this.publicBase}?key=${encodeURIComponent(storageKey)}`,
    };
  }

  private async saveSupabase(
    storageKey: string,
    buffer: Buffer,
  ): Promise<StoredObject> {
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new ServiceUnavailableException(
        'Storage Supabase no configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      );
    }

    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${storageKey}`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.supabaseKey}`,
        apikey: this.supabaseKey,
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: new Uint8Array(buffer),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Supabase upload failed: ${res.status} ${detail}`);
      throw new ServiceUnavailableException(
        'No se pudo guardar el documento en Supabase Storage',
      );
    }

    const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${storageKey}`;
    return { storageKey, storageUrl: publicUrl };
  }

  resolveAbsolute(storageKey: string): string {
    return join(this.root, storageKey.replace(/^\/+/, ''));
  }

  publicUrlFor(storageKey: string): string | null {
    if (!this.supabaseUrl) return null;
    return `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${storageKey}`;
  }

  /**
   * Stream del archivo sin depender del driver:
   * 1) disco local si existe
   * 2) Supabase público
   * 3) Supabase autenticado (service role)
   * 4) URL firmada + fetch
   */
  async openAsStream(storageKey: string): Promise<{
    stream: Readable;
    mimeHint?: string;
  }> {
    const key = this.sanitizeKey(storageKey.replace(/^\/+/, ''));
    if (!key || key.includes('..')) {
      throw new BadRequestException('Clave de archivo inválida');
    }

    const absolute = this.resolveAbsolute(key);
    const fallback = this.resolveAbsolute(storageKey.replace(/^\/+/, ''));
    const localPath = existsSync(absolute)
      ? absolute
      : existsSync(fallback)
        ? fallback
        : null;
    if (localPath) {
      return { stream: createReadStream(localPath) };
    }

    if (!this.supabaseUrl || !this.supabaseKey) {
      this.logger.error(
        `Archivo ausente en disco y Supabase no configurado (key=${key}, driver=${this.driver})`,
      );
      throw new NotFoundException(
        'Archivo no encontrado (configure SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Render)',
      );
    }

    const stream = await this.fetchSupabaseObject(key);
    return { stream };
  }

  /** URL firmada de corta duración para descarga directa en el navegador. */
  async createSignedUrl(
    storageKey: string,
    expiresInSeconds = 180,
  ): Promise<string> {
    const key = this.sanitizeKey(storageKey.replace(/^\/+/, ''));
    if (!key || key.includes('..')) {
      throw new BadRequestException('Clave de archivo inválida');
    }
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new ServiceUnavailableException(
        'Storage Supabase no configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      );
    }

    const signRes = await fetch(
      `${this.supabaseUrl}/storage/v1/object/sign/${this.bucket}/${key}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.supabaseKey}`,
          apikey: this.supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      },
    );
    const body = (await signRes.json().catch(() => ({}))) as {
      signedURL?: string;
      signedUrl?: string;
      error?: string;
      message?: string;
    };
    if (!signRes.ok) {
      this.logger.error(
        `Supabase sign failed key=${key}: ${signRes.status} ${JSON.stringify(body)}`,
      );
      throw new NotFoundException('No se pudo firmar la URL del archivo');
    }
    const path = body.signedURL || body.signedUrl;
    if (!path) {
      throw new NotFoundException('Supabase no devolvió signedURL');
    }
    return path.startsWith('http')
      ? path
      : `${this.supabaseUrl}/storage/v1${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async fetchSupabaseObject(key: string): Promise<Readable> {
    const candidates: Array<{ label: string; url: string; auth: boolean }> = [
      {
        label: 'public',
        url: `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${key}`,
        auth: false,
      },
      {
        label: 'authenticated',
        url: `${this.supabaseUrl}/storage/v1/object/authenticated/${this.bucket}/${key}`,
        auth: true,
      },
      {
        label: 'object',
        url: `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${key}`,
        auth: true,
      },
    ];

    for (const c of candidates) {
      try {
        const res = await fetch(c.url, {
          headers: c.auth
            ? {
                Authorization: `Bearer ${this.supabaseKey}`,
                apikey: this.supabaseKey!,
              }
            : undefined,
        });
        if (res.ok && res.body) {
          return NodeReadable.fromWeb(
            res.body as import('stream/web').ReadableStream,
          );
        }
        this.logger.warn(
          `Supabase ${c.label} → ${res.status} key=${key}`,
        );
      } catch (err) {
        this.logger.warn(
          `Supabase ${c.label} falló key=${key}: ${(err as Error).message}`,
        );
      }
    }

    // Último recurso: firmar y bajar
    try {
      const signed = await this.createSignedUrl(key, 60);
      const res = await fetch(signed);
      if (res.ok && res.body) {
        return NodeReadable.fromWeb(
          res.body as import('stream/web').ReadableStream,
        );
      }
    } catch (err) {
      this.logger.error(
        `Supabase signed fetch falló key=${key}: ${(err as Error).message}`,
      );
    }

    throw new NotFoundException('Archivo no encontrado en storage');
  }

  async open(storageKey: string): Promise<OpenedObject> {
    const key = this.sanitizeKey(storageKey.replace(/^\/+/, ''));
    if (!key || key.includes('..')) {
      throw new BadRequestException('Clave de archivo inválida');
    }

    const absolute = this.resolveAbsolute(key);
    const fallback = this.resolveAbsolute(storageKey.replace(/^\/+/, ''));
    const path = existsSync(absolute)
      ? absolute
      : existsSync(fallback)
        ? fallback
        : null;
    if (path) {
      return { kind: 'stream', stream: createReadStream(path) };
    }

    // Preferir URL firmada (bucket privado) si hay credenciales
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const signed = await this.createSignedUrl(key, 300);
        return { kind: 'redirect', url: signed };
      } catch (err) {
        this.logger.warn(
          `No se pudo firmar ${key}: ${(err as Error).message}`,
        );
      }
    }

    if (this.driver === 'supabase' || this.supabaseUrl) {
      const url = this.publicUrlFor(key);
      if (url) return { kind: 'redirect', url };
    }

    throw new NotFoundException('Archivo no encontrado');
  }
}
