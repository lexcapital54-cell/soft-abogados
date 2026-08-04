/**
 * Carga BASE_DE_DATOS_REBALANCEADA.csv → Deceased + Case + Relative
 * Regla 1:N: agrupa por Titular_Cedula (1 caso, N herederos).
 */
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import csv from 'csv-parser';
import {
  CasePriority,
  KinshipType,
  PrismaClient,
} from '@prisma/client';
import {
  buildCaseFolderPath,
  sanitizeFolderName as sanitizeNamePart,
} from '../src/common/utils/sanitize-folder-name';

export type CsvRow = {
  ID_Caso_Asesor?: string;
  Titular_Cedula?: string;
  Titular_Nombre?: string;
  Saldo_Inicial?: string;
  Prioridad?: string;
  Titular_Observacion?: string;
  Asesor_Asignado?: string;
  Heredero_Nombre?: string;
  Heredero_Parentesco?: string;
  Heredero_Ubicacion?: string;
  Heredero_Cedula?: string;
  Heredero_Telefono?: string;
  Heredero_Email?: string;
  Heredero_Observacion_Adicional?: string;
  Heredero_Serial_Nacimiento?: string;
  Heredero_Ubicacion_Doc?: string;
  Heredero_Imagen?: string;
  Heredero_Serial_Matrimonio?: string;
};

export type GroupedHeir = {
  nombre: string;
  cedula?: string;
  parentesco?: string;
  telefono?: string;
  email?: string;
  ubicacion?: string;
  observacion?: string;
  serialNacimiento?: string;
  ubicacionDoc?: string;
  imagen?: string;
  serialMatrimonio?: string;
};

export type GroupedCase = {
  titularCedula: string;
  titularNombre: string;
  saldoInicial: number;
  prioridad: number | null;
  titularObservacion?: string;
  asesorAsignado?: string;
  herederos: GroupedHeir[];
};

/** Cedula + nombre limpio → ruta carpeta (sin prefijo casos/ en el ejemplo de negocio). */
export function sanitizeFolderName(cedula: string, nombreRaw: string): string {
  const folder = buildCaseFolderPath(cedula, nombreRaw);
  return folder.replace(/^casos\//, '');
}

export function cleanTitularDisplayName(nombreRaw: string): string {
  const part = sanitizeNamePart(nombreRaw);
  return part.replace(/_/g, ' ').trim() || 'TITULAR SIN NOMBRE';
}

function parseNumber(raw?: string): number {
  if (!raw || !String(raw).trim()) return 0;
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function mapPriority(raw?: string): CasePriority {
  const n = parseNumber(raw);
  if (n >= 3) return CasePriority.HIGH;
  if (n >= 2) return CasePriority.MEDIUM;
  if (n >= 1) return CasePriority.LOW;
  return CasePriority.MEDIUM;
}

function mapKinship(raw?: string): KinshipType {
  const v = (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (!v) return KinshipType.OTRO;
  if (v.includes('HIJA')) return KinshipType.HIJA;
  if (v.includes('HIJO') || v === 'HIO') return KinshipType.HIJO;
  if (v.includes('ESPOSA') || v.includes('ESPOSO') || v.includes('CONYUGE')) {
    return KinshipType.CONYUGE;
  }
  if (v.includes('COMPANERO')) return KinshipType.COMPANERO_PERMANENTE;
  if (v.includes('MADRE') || v.includes('MAMA')) return KinshipType.MADRE;
  if (v.includes('PADRE')) return KinshipType.PADRE;
  if (v.includes('HERMANA')) return KinshipType.HERMANA;
  if (v.includes('HERMANO')) return KinshipType.HERMANO;
  if (v.includes('NIETA')) return KinshipType.NIETA;
  if (v.includes('NIETO')) return KinshipType.NIETO;
  return KinshipType.OTRO;
}

function firstEmail(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const email = raw
    .split(/[;,\s]+/)
    .map((x) => x.trim())
    .find((x) => x.includes('@'));
  return email?.slice(0, 190);
}

function firstPhone(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const cleaned = raw.trim();
  if (/^sin\s*informaci[oó]n$/i.test(cleaned)) return undefined;
  // Prefer longest digit runs (celulares 10) but accept fijos 7+
  const runs = cleaned.match(/\d[\d\s/-]{5,}\d/g);
  if (!runs?.length) {
    const digitsOnly = cleaned.replace(/\D/g, '');
    return digitsOnly.length >= 7 ? digitsOnly.slice(0, 80) : undefined;
  }
  const normalized = runs
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length);
  // Keep original multi-number text when several phones appear
  if (runs.length > 1 && cleaned.length <= 80) {
    return cleaned.slice(0, 80);
  }
  return normalized[0]?.slice(0, 80);
}

export function resolveCsvPath(): string {
  if (process.env.CSV_SEED_PATH) {
    return process.env.CSV_SEED_PATH;
  }

  const candidates = [
    // apps/api/prisma → monorepo root
    join(__dirname, '../../../BASE_DE_DATOS_REBALANCEADA.csv'),
    // cwd = apps/api
    join(process.cwd(), '../../BASE_DE_DATOS_REBALANCEADA.csv'),
    // cwd = monorepo root
    join(process.cwd(), 'BASE_DE_DATOS_REBALANCEADA.csv'),
    // cwd = apps/api/prisma
    join(process.cwd(), '../../BASE_DE_DATOS_REBALANCEADA.csv'),
  ];

  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `No se encontró BASE_DE_DATOS_REBALANCEADA.csv. Buscado en:\n${candidates.join('\n')}`,
    );
  }
  return found;
}

export function readCsvGrouped(csvPath: string): Promise<Map<string, GroupedCase>> {
  return new Promise((resolve, reject) => {
    const groups = new Map<string, GroupedCase>();

    createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row: CsvRow) => {
        const cedula = String(row.Titular_Cedula ?? '')
          .replace(/\D/g, '')
          .trim();
        if (!cedula) return;

        const nombre = String(row.Titular_Nombre ?? '').trim();
        let group = groups.get(cedula);
        if (!group) {
          group = {
            titularCedula: cedula,
            titularNombre: nombre || `TITULAR ${cedula}`,
            saldoInicial: parseNumber(row.Saldo_Inicial),
            prioridad: row.Prioridad?.trim()
              ? parseNumber(row.Prioridad)
              : null,
            titularObservacion: row.Titular_Observacion?.trim() || undefined,
            asesorAsignado: row.Asesor_Asignado?.trim() || undefined,
            herederos: [],
          };
          groups.set(cedula, group);
        } else {
          // Conservar el mayor saldo / prioridad no vacía
          const saldo = parseNumber(row.Saldo_Inicial);
          if (saldo > group.saldoInicial) group.saldoInicial = saldo;
          if (row.Prioridad?.trim() && group.prioridad == null) {
            group.prioridad = parseNumber(row.Prioridad);
          }
          if (!group.titularObservacion && row.Titular_Observacion?.trim()) {
            group.titularObservacion = row.Titular_Observacion.trim();
          }
          if (!group.asesorAsignado && row.Asesor_Asignado?.trim()) {
            group.asesorAsignado = row.Asesor_Asignado.trim();
          }
        }

        const heirName = row.Heredero_Nombre?.trim();
        if (!heirName) return;

        group.herederos.push({
          nombre: heirName,
          cedula: row.Heredero_Cedula?.replace(/\D/g, '').trim() || undefined,
          parentesco: row.Heredero_Parentesco?.trim() || undefined,
          telefono: firstPhone(row.Heredero_Telefono),
          email: firstEmail(row.Heredero_Email),
          ubicacion: row.Heredero_Ubicacion?.trim() || undefined,
          observacion: row.Heredero_Observacion_Adicional?.trim() || undefined,
          serialNacimiento: row.Heredero_Serial_Nacimiento?.trim() || undefined,
          ubicacionDoc: row.Heredero_Ubicacion_Doc?.trim() || undefined,
          imagen: row.Heredero_Imagen?.trim() || undefined,
          serialMatrimonio: row.Heredero_Serial_Matrimonio?.trim() || undefined,
        });
      })
      .on('end', () => resolve(groups))
      .on('error', reject);
  });
}

type AdvisorMap = Map<string, string>;

export async function importRebalancedCsv(
  prisma: PrismaClient,
  advisorByLabel: AdvisorMap,
): Promise<{ ok: number; failed: number; heirs: number }> {
  const csvPath = resolveCsvPath();
  console.log(`CSV → ${csvPath}`);
  const groups = await readCsvGrouped(csvPath);
  console.log(`Titulares únicos (casos): ${groups.size}`);

  let ok = 0;
  let failed = 0;
  let heirs = 0;
  let seq = 0;

  for (const group of groups.values()) {
    seq += 1;
    try {
      const displayName = cleanTitularDisplayName(group.titularNombre);
      const folderKey = sanitizeFolderName(
        group.titularCedula,
        group.titularNombre,
      );
      const storageFolderPath = `casos/${folderKey}`;
      const fees = Math.round(group.saldoInicial * 0.3);
      const advisorId =
        (group.asesorAsignado &&
          advisorByLabel.get(group.asesorAsignado.trim())) ||
        null;

      const deceased = await prisma.deceased.upsert({
        where: { documentNumber: group.titularCedula },
        update: {
          fullName: displayName,
          observations: group.titularObservacion,
        },
        create: {
          documentNumber: group.titularCedula,
          fullName: displayName,
          observations: group.titularObservacion,
        },
      });

      let caso = await prisma.case.findFirst({
        where: {
          OR: [
            { storageFolderPath },
            {
              deceasedId: deceased.id,
              fileNumber: group.titularCedula,
            },
          ],
        },
      });

      if (!caso) {
        const internalCode = `LC-CSV-${String(seq).padStart(5, '0')}`;
        caso = await prisma.case.create({
          data: {
            internalCode,
            fileNumber: group.titularCedula,
            deceasedId: deceased.id,
            advisorId,
            recoverableValue: group.saldoInicial,
            estimatedFees: fees,
            priority: mapPriority(
              group.prioridad != null ? String(group.prioridad) : undefined,
            ),
            observations: group.titularObservacion,
            storageFolderPath,
            lastActivityAt: new Date(),
          },
        });
      } else {
        caso = await prisma.case.update({
          where: { id: caso.id },
          data: {
            advisorId,
            recoverableValue: group.saldoInicial,
            estimatedFees: fees,
            priority: mapPriority(
              group.prioridad != null ? String(group.prioridad) : undefined,
            ),
            observations: group.titularObservacion,
            storageFolderPath,
            lastActivityAt: new Date(),
          },
        });
      }

      // Reemplazo controlado de herederos del caso (idempotente por seed)
      await prisma.relative.deleteMany({ where: { caseId: caso.id } });

      if (group.herederos.length) {
        await prisma.relative.createMany({
          data: group.herederos.map((h) => ({
            deceasedId: deceased.id,
            caseId: caso!.id,
            fullName: h.nombre,
            documentNumber: h.cedula || null,
            kinship: mapKinship(h.parentesco),
            mobile: h.telefono || null,
            phone: h.telefono || null,
            email: h.email || null,
            city: h.ubicacion || null,
            observations: h.observacion || null,
            birthSerial: h.serialNacimiento || null,
            marriageSerial: h.serialMatrimonio || null,
            docLocation: h.ubicacionDoc || null,
            imageUrl: h.imagen || null,
            advisorId,
          })),
        });
        heirs += group.herederos.length;
      }

      ok += 1;
      if (ok % 50 === 0) {
        console.log(`  … ${ok}/${groups.size} casos`);
      }
    } catch (err) {
      failed += 1;
      console.error(
        `Error caso cédula=${group.titularCedula}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { ok, failed, heirs };
}

/** Mapa etiqueta Excel → userId (para seed). */
export function buildAdvisorLabelMap(users: {
  asesor1?: string;
  asesor2?: string;
  asesor3?: string;
  asesor4?: string;
  asesor5?: string;
}): AdvisorMap {
  const map: AdvisorMap = new Map();
  if (users.asesor1) map.set('Asesor 1', users.asesor1);
  if (users.asesor2) map.set('Asesor 2', users.asesor2);
  if (users.asesor3) map.set('Asesor 3', users.asesor3);
  if (users.asesor4) map.set('Asesor 4', users.asesor4);
  if (users.asesor5) map.set('Asesor 5', users.asesor5);
  return map;
}
