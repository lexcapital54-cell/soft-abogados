import { createHash } from 'node:crypto';
import type { Person } from './kinship.types';

type RawRow = Record<string, unknown>;

const COLUMN_ALIASES: Record<keyof Pick<
  Person,
  | 'cedula'
  | 'nombres'
  | 'primerApellido'
  | 'segundoApellido'
  | 'ciudadNacimiento'
  | 'ciudadExpedicion'
  | 'anioNacimiento'
  | 'nombresPadres'
>, string[]> = {
  cedula: [
    'cedula',
    'cédula',
    'documento',
    'documentonumero',
    'document_number',
    'cc',
    'nit',
    'identificacion',
  ],
  nombres: [
    'nombres',
    'nombre',
    'primer_nombre',
    'firstname',
    'name',
    'nombrescompletos',
    'nombrecompleto',
    'full_name',
    'fullname',
  ],
  primerApellido: [
    'primerapellido',
    'primer_apellido',
    'apellido1',
    'apellido',
    'lastname',
    'first_surname',
  ],
  segundoApellido: [
    'segundoapellido',
    'segundo_apellido',
    'apellido2',
    'second_surname',
  ],
  ciudadNacimiento: [
    'ciudadnacimiento',
    'ciudad_nacimiento',
    'nacimiento',
    'lugarnacimiento',
    'birth_city',
  ],
  ciudadExpedicion: [
    'ciudadexpedicion',
    'ciudad_expedicion',
    'expedicion',
    'lugar_expedicion',
    'expedida_en',
  ],
  anioNacimiento: [
    'anionacimiento',
    'año_nacimiento',
    'ano_nacimiento',
    'anio_nacimiento',
    'fechanacimiento',
    'fecha_nacimiento',
    'birth_year',
    'nacimiento_anio',
  ],
  nombresPadres: [
    'nombrespadres',
    'nombres_padres',
    'padres',
    'padre',
    'madre',
    'nombrepadre',
    'nombremadre',
    'filiacion',
  ],
};

function keyOf(k: string): string {
  return k
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pick(row: RawRow, aliases: string[]): string | null {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    map.set(keyOf(k), v);
  }
  for (const a of aliases) {
    const v = map.get(keyOf(a));
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return null;
}

function parseYear(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/(19|20)\d{2}/);
  if (m) return Number(m[0]);
  const n = Number(value);
  if (Number.isFinite(n) && n > 1900 && n < 2100) return n;
  return null;
}

function splitName(full: string): {
  nombres: string;
  primerApellido: string;
  segundoApellido: string;
} {
  const parts = full
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length <= 1) {
    return { nombres: full.trim(), primerApellido: '', segundoApellido: '' };
  }
  if (parts.length === 2) {
    return {
      nombres: parts[0]!,
      primerApellido: parts[1]!,
      segundoApellido: '',
    };
  }
  if (parts.length === 3) {
    return {
      nombres: parts[0]!,
      primerApellido: parts[1]!,
      segundoApellido: parts[2]!,
    };
  }
  // Heurística CO: N N A1 A2
  return {
    nombres: parts.slice(0, parts.length - 2).join(' '),
    primerApellido: parts[parts.length - 2]!,
    segundoApellido: parts[parts.length - 1]!,
  };
}

function makeId(source: Person['source'], cedula: string | null, fullName: string, idx: number) {
  const base = `${source}|${cedula ?? ''}|${fullName}|${idx}`;
  return createHash('sha1').update(base).digest('hex').slice(0, 12);
}

/** Normalización heurística local (sin OpenAI) */
export function normalizeRowsHeuristic(
  rows: RawRow[],
  source: Person['source'],
  chunkSize = 400,
): Person[] {
  const out: Person[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) {
      const row = chunk[j]!;
      const idx = i + j;
      let nombres = pick(row, COLUMN_ALIASES.nombres) ?? '';
      let primerApellido = pick(row, COLUMN_ALIASES.primerApellido) ?? '';
      let segundoApellido = pick(row, COLUMN_ALIASES.segundoApellido) ?? '';
      const cedula = pick(row, COLUMN_ALIASES.cedula);

      if ((!primerApellido || !nombres) && nombres.includes(' ')) {
        const split = splitName(nombres);
        if (!primerApellido) {
          nombres = split.nombres;
          primerApellido = split.primerApellido;
          segundoApellido = segundoApellido || split.segundoApellido;
        }
      }

      // Si solo hay "nombre completo" en una columna genérica
      if (!nombres && !primerApellido) {
        const anyName =
          pick(row, ['nombrecompleto', 'nombre_completo', 'titular', 'fallecido']) ??
          '';
        if (anyName) {
          const split = splitName(anyName);
          nombres = split.nombres;
          primerApellido = split.primerApellido;
          segundoApellido = split.segundoApellido;
        }
      }

      const fullName = [nombres, primerApellido, segundoApellido]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!fullName) continue;

      out.push({
        id: makeId(source, cedula, fullName, idx),
        source,
        cedula,
        nombres,
        primerApellido,
        segundoApellido,
        fullName,
        ciudadNacimiento: pick(row, COLUMN_ALIASES.ciudadNacimiento),
        ciudadExpedicion: pick(row, COLUMN_ALIASES.ciudadExpedicion),
        anioNacimiento: parseYear(pick(row, COLUMN_ALIASES.anioNacimiento)),
        nombresPadres: pick(row, COLUMN_ALIASES.nombresPadres),
        raw: row,
      });
    }
  }
  return out;
}

export function detectColumns(sample: RawRow[]): string[] {
  if (!sample.length) return [];
  return Object.keys(sample[0] ?? {});
}
