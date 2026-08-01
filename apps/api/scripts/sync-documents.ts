/**
 * =============================================================================
 * LEX CAPITAL — Sync Script de Migración Documental
 * =============================================================================
 * Lee el directorio local "Casos y documentos", asocia archivos a casos Prisma
 * por cédula del titular (fallecido) y crea carpetas faltantes en storage.
 *
 * CÓMO EJECUTAR (seguro, fuera del hot-path de producción):
 *   cd apps/api
 *   # Simulación (no escribe archivos ni BD):
 *   npm run sync:documents -- --dry-run
 *   # Ejecución real (horario valle recomendado):
 *   npm run sync:documents
 *   # Limitar volumen / pausas entre lotes:
 *   npm run sync:documents -- --limit=50 --delay-ms=25
 *
 * Variables (.env):
 *   DATABASE_URL          — PostgreSQL
 *   SYNC_DOCS_ROOT        — ruta a "Casos y documentos" (default: monorepo/…)
 *   STORAGE_ROOT          — raíz del bucket local (default: apps/api/storage)
 *   STORAGE_PUBLIC_BASE   — base URL del endpoint /documents/file
 *   API_PORT / API_PREFIX — usados si no hay STORAGE_PUBLIC_BASE
 *
 * No lanzar desde un request HTTP concurrente en producción: es un job CLI
 * batch, con delays, para no saturar I/O ni el pool de Prisma.
 * =============================================================================
 */

import {
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs';
import { join, basename, extname, resolve, dirname } from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  PrismaClient,
  CaseStatus,
  DocumentCategory,
  DocumentStatus,
} from '@prisma/client';
import {
  buildCaseFolderPath,
  sanitizeFileName,
} from '../src/common/utils/sanitize-folder-name';

// Carga .env desde apps/api (cwd esperado al correr el script)
loadEnv({ path: resolve(__dirname, '../.env') });

// -----------------------------------------------------------------------------
// Colores ANSI (equivalente ligero a chalk; sin dependencia ESM)
// -----------------------------------------------------------------------------
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function logSuccess(msg: string) {
  console.log(`${c.green}${c.bold}[SUCCESS]${c.reset} ${msg}`);
}
function logWarning(msg: string) {
  console.log(`${c.yellow}${c.bold}[WARNING]${c.reset} ${msg}`);
}
function logInfo(msg: string) {
  console.log(`${c.cyan}${c.bold}[INFO]${c.reset} ${msg}`);
}
function logError(msg: string) {
  console.log(`${c.red}${c.bold}[ERROR]${c.reset} ${msg}`);
}
function logSkip(msg: string) {
  console.log(`${c.gray}[SKIP]${c.reset} ${msg}`);
}

// -----------------------------------------------------------------------------
// CLI flags
// -----------------------------------------------------------------------------
type Flags = {
  dryRun: boolean;
  limit: number | null;
  delayMs: number;
  onlyCreateFolders: boolean;
  onlyIngest: boolean;
};

function parseFlags(argv: string[]): Flags {
  const dryRun = argv.includes('--dry-run');
  const onlyCreateFolders = argv.includes('--only-folders');
  const onlyIngest = argv.includes('--only-ingest');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const delayArg = argv.find((a) => a.startsWith('--delay-ms='));
  return {
    dryRun,
    onlyCreateFolders,
    onlyIngest,
    limit: limitArg ? Number(limitArg.split('=')[1]) || null : null,
    delayMs: delayArg ? Number(delayArg.split('=')[1]) || 0 : 15,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// -----------------------------------------------------------------------------
// Paths / storage
// -----------------------------------------------------------------------------
function resolveDocsRoot(): string {
  if (process.env.SYNC_DOCS_ROOT?.trim()) {
    return resolve(process.env.SYNC_DOCS_ROOT.trim());
  }
  // monorepo/Casos y documentos (script vive en apps/api/scripts)
  return resolve(__dirname, '../../..', 'Casos y documentos');
}

function resolveStorageRoot(): string {
  if (process.env.STORAGE_ROOT?.trim()) {
    return resolve(process.env.STORAGE_ROOT.trim());
  }
  return resolve(__dirname, '../storage');
}

function publicBaseUrl(): string {
  if (process.env.STORAGE_PUBLIC_BASE?.trim()) {
    return process.env.STORAGE_PUBLIC_BASE.trim().replace(/\/$/, '');
  }
  const port = process.env.API_PORT ?? '3000';
  const prefix = process.env.API_PREFIX ?? 'api/v1';
  return `http://localhost:${port}/${prefix}/documents/file`;
}

function storageUrlFor(key: string): string {
  return `${publicBaseUrl()}?key=${encodeURIComponent(key)}`;
}

/** Archivos de sistema / basura a ignorar */
function isIgnoredFile(name: string): boolean {
  const n = name.toLowerCase();
  if (name.startsWith('.')) return true;
  if (name.startsWith('~$')) return true; // lock Word
  return (
    n === '.ds_store' ||
    n === 'thumbs.db' ||
    n === 'desktop.ini' ||
    n === '.keep' ||
    n === '.gitkeep'
  );
}

/**
 * Extrae cédula del nombre de carpeta.
 * Soporta: "1053444555 - Juan Perez", "Juan Perez  1053444555", "1053444555"
 */
export function extractCedula(folderName: string): string | null {
  const cleaned = folderName.replace(/\u00a0/g, ' ').trim();
  // Preferir bloque de dígitos al final
  const end = cleaned.match(/(\d{5,12})\s*$/);
  if (end?.[1]) return end[1];
  // Prefijo "cedula - nombre"
  const start = cleaned.match(/^(\d{5,12})\b/);
  if (start?.[1]) return start[1];
  // Cualquier secuencia más larga (5–12)
  const all = cleaned.match(/\d{5,12}/g);
  if (!all?.length) return null;
  return all.sort((a, b) => b.length - a.length)[0] ?? null;
}

function guessMime(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] ?? 'application/octet-stream';
}

function guessCategory(fileName: string): DocumentCategory {
  const n = fileName.toLowerCase();
  if (n.includes('poder')) return DocumentCategory.PODER;
  if (n.includes('cedula') || n.includes('cédula') || n.includes('registro')) {
    return DocumentCategory.FALLECIDO;
  }
  if (n.includes('demanda') || n.includes('fallo') || n.includes('sentencia')) {
    return DocumentCategory.JUDICIAL;
  }
  if (n.includes('contrato') || n.includes('paz') || n.includes('salvo')) {
    return DocumentCategory.CONTRATO;
  }
  return DocumentCategory.OTRO;
}

function ensureDir(abs: string, dryRun: boolean) {
  if (dryRun) return;
  mkdirSync(abs, { recursive: true });
}

function writeKeep(folderAbs: string, dryRun: boolean) {
  const keep = join(folderAbs, '.keep');
  if (dryRun) return;
  if (!existsSync(keep)) {
    writeFileSync(keep, '');
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const docsRoot = resolveDocsRoot();
  const storageRoot = resolveStorageRoot();
  const prisma = new PrismaClient();

  console.log(`\n${c.bold}LEX CAPITAL · Sync Documental${c.reset}`);
  console.log(`${c.dim}Docs root:${c.reset}     ${docsRoot}`);
  console.log(`${c.dim}Storage root:${c.reset} ${storageRoot}`);
  console.log(
    `${c.dim}Mode:${c.reset}          ${flags.dryRun ? 'DRY-RUN (sin escritura)' : 'WRITE'}`,
  );
  console.log(
    `${c.dim}Delay/lote:${c.reset}    ${flags.delayMs}ms | limit=${flags.limit ?? '∞'}\n`,
  );

  if (!existsSync(docsRoot)) {
    logError(`No existe el directorio de origen: ${docsRoot}`);
    logInfo('Defina SYNC_DOCS_ROOT en .env o cree la carpeta "Casos y documentos".');
    process.exit(1);
  }

  ensureDir(storageRoot, flags.dryRun);

  const stats = {
    foldersScanned: 0,
    matched: 0,
    unmatched: 0,
    filesUploaded: 0,
    filesSkipped: 0,
    foldersCreated: 0,
    errors: 0,
  };

  try {
    // =========================================================================
    // FASE 1 — Ingesta desde "Casos y documentos"
    // =========================================================================
    if (!flags.onlyCreateFolders) {
      logInfo('Fase 1: lectura e ingesta de carpetas locales…');

      const entries = readdirSync(docsRoot, { withFileTypes: true }).filter(
        (d) => d.isDirectory() && !d.name.startsWith('.'),
      );

      const limited = flags.limit
        ? entries.slice(0, flags.limit)
        : entries;

      for (const dirent of limited) {
        stats.foldersScanned++;
        const folderName = dirent.name;
        const folderAbs = join(docsRoot, folderName);
        const cedula = extractCedula(folderName);

        if (!cedula) {
          logWarning(`No se pudo extraer cédula de la carpeta: "${folderName}"`);
          stats.unmatched++;
          continue;
        }

        const caso = await prisma.case.findFirst({
          where: {
            OR: [
              { deceased: { documentNumber: cedula } },
              { fileNumber: cedula },
            ],
          },
          include: {
            deceased: {
              select: { documentNumber: true, fullName: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        });

        if (!caso) {
          logWarning(
            `Caso no encontrado en BD para la carpeta con cédula ${cedula} ("${folderName}")`,
          );
          stats.unmatched++;
          continue;
        }

        stats.matched++;
        const folderPath = buildCaseFolderPath(
          caso.deceased.documentNumber,
          caso.deceased.fullName,
        );
        const destAbs = join(storageRoot, folderPath);
        ensureDir(destAbs, flags.dryRun);

        if (!flags.dryRun && caso.storageFolderPath !== folderPath) {
          await prisma.case.update({
            where: { id: caso.id },
            data: { storageFolderPath: folderPath },
          });
        }

        const files = readdirSync(folderAbs).filter((f) => {
          if (isIgnoredFile(f)) return false;
          try {
            return statSync(join(folderAbs, f)).isFile();
          } catch {
            return false;
          }
        });

        for (const fileName of files) {
          try {
            const src = join(folderAbs, fileName);
            const size = statSync(src).size;
            const safeName = sanitizeFileName(fileName);
            // Ruta estandarizada: casos/[CEDULA]_[NOMBRE]/[archivo]
            // Prefijo temporal evita colisiones entre syncs
            const stamped = `${Date.now().toString(36)}_${Math.random()
              .toString(36)
              .slice(2, 8)}_${safeName}`;
            const storageKey = `${folderPath}/${stamped}`.replace(/\\/g, '/');
            const destFile = join(storageRoot, storageKey);

            // Idempotencia: si ya existe mismo originalFileName con archivo
            const existing = await prisma.document.findFirst({
              where: {
                caseId: caso.id,
                originalFileName: fileName,
                storageKey: { not: null },
              },
            });
            if (existing) {
              logSkip(
                `Ya asociado: ${fileName} → ${caso.internalCode}`,
              );
              stats.filesSkipped++;
              continue;
            }

            if (!flags.dryRun) {
              ensureDir(dirname(destFile), false);
              copyFileSync(src, destFile);

              await prisma.document.create({
                data: {
                  caseId: caso.id,
                  name: basename(fileName, extname(fileName)) || fileName,
                  category: guessCategory(fileName),
                  status: DocumentStatus.CARGADO, // ≈ ENTREGADO en el dominio Lex
                  isRequired: false,
                  storageKey,
                  storageUrl: storageUrlFor(storageKey),
                  originalFileName: fileName,
                  mimeType: guessMime(fileName),
                  fileSize: size,
                  uploadedAt: new Date(),
                  version: 1,
                  observations: `Migrado desde sync-documents · carpeta origen "${folderName}"`,
                },
              });
            }

            logSuccess(
              `Archivo subido y asociado al caso ${caso.internalCode}: ${fileName}`,
            );
            stats.filesUploaded++;
          } catch (err) {
            stats.errors++;
            logError(
              `Falló ${fileName} en ${caso.internalCode}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }

        if (flags.delayMs > 0) await sleep(flags.delayMs);
      }
    }

    // =========================================================================
    // FASE 2 — Carpetas faltantes para casos activos
    // =========================================================================
    if (!flags.onlyIngest) {
      logInfo('Fase 2: creación de carpetas para casos sin documentación…');

      const activeCases = await prisma.case.findMany({
        where: {
          status: {
            in: [
              CaseStatus.ACTIVE,
              CaseStatus.CRITICAL,
              CaseStatus.JUDICIAL,
              CaseStatus.COMMERCIAL,
            ],
          },
        },
        include: {
          deceased: {
            select: { documentNumber: true, fullName: true },
          },
        },
        take: flags.limit ?? undefined,
      });

      for (const caso of activeCases) {
        let folderPath = caso.storageFolderPath;
        try {
          if (!folderPath) {
            folderPath = buildCaseFolderPath(
              caso.deceased.documentNumber,
              caso.deceased.fullName,
            );
          }
        } catch (err) {
          stats.errors++;
          logError(
            `No se pudo nombrar carpeta para ${caso.internalCode}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          continue;
        }

        const abs = join(storageRoot, folderPath);
        const exists = existsSync(abs);

        if (!exists) {
          ensureDir(abs, flags.dryRun);
          writeKeep(abs, flags.dryRun);
          if (!flags.dryRun) {
            await prisma.case.update({
              where: { id: caso.id },
              data: { storageFolderPath: folderPath },
            });
          }
          logInfo(
            `Carpeta creada para el caso sin documentación: ${basename(folderPath)} (${caso.internalCode})`,
          );
          stats.foldersCreated++;
        } else if (!caso.storageFolderPath && !flags.dryRun) {
          await prisma.case.update({
            where: { id: caso.id },
            data: { storageFolderPath: folderPath },
          });
          logInfo(
            `Carpeta existente enlazada en BD: ${basename(folderPath)} (${caso.internalCode})`,
          );
        }

        if (flags.delayMs > 0) await sleep(Math.min(flags.delayMs, 10));
      }
    }

    // =========================================================================
    // Resumen
    // =========================================================================
    console.log(`\n${c.bold}—— Resumen ——${c.reset}`);
    console.log(`  Carpetas escaneadas: ${stats.foldersScanned}`);
    console.log(`  Casos emparejados:   ${stats.matched}`);
    console.log(`  Sin match BD:        ${stats.unmatched}`);
    console.log(`  Archivos subidos:    ${stats.filesUploaded}`);
    console.log(`  Archivos omitidos:   ${stats.filesSkipped}`);
    console.log(`  Carpetas creadas:    ${stats.foldersCreated}`);
    console.log(`  Errores:             ${stats.errors}`);
    if (flags.dryRun) {
      logWarning('DRY-RUN: no se persistió nada. Quite --dry-run para aplicar.');
    }
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logError(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
