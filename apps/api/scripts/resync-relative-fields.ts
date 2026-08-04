/**
 * Rellena en Neon cédula / teléfono / observaciones de herederos
 * que existían en BASE_DE_DATOS_REBALANCEADA.csv pero quedaron vacíos.
 *
 *   cd apps/api
 *   npx ts-node --project scripts/tsconfig.json scripts/resync-relative-fields.ts
 *   npx ts-node --project scripts/tsconfig.json scripts/resync-relative-fields.ts --dry-run
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  readCsvGrouped,
  resolveCsvPath,
} from '../prisma/import-rebalanced-csv';

loadEnv({ path: resolve(__dirname, '../.env') });

const dryRun = process.argv.includes('--dry-run');

function dbUrl(): string {
  const base = process.env.DATABASE_URL ?? '';
  if (!base) throw new Error('Falta DATABASE_URL en apps/api/.env');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}connect_timeout=30`;
}

function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl() } },
  });
  const csvPath = resolveCsvPath();
  console.log(`CSV: ${csvPath}`);
  console.log(`Modo: ${dryRun ? 'DRY-RUN' : 'UPDATE'}`);

  const groups = await readCsvGrouped(csvPath);
  let matched = 0;
  let updated = 0;
  let skipped = 0;
  const samples: string[] = [];

  for (const group of groups.values()) {
    const deceased = await prisma.deceased.findUnique({
      where: { documentNumber: group.titularCedula },
      select: { id: true },
    });
    if (!deceased) {
      skipped += group.herederos.length;
      continue;
    }

    const relatives = await prisma.relative.findMany({
      where: { deceasedId: deceased.id },
      select: {
        id: true,
        fullName: true,
        documentNumber: true,
        phone: true,
        mobile: true,
        observations: true,
      },
    });

    const byName = new Map(
      relatives.map((r) => [normName(r.fullName), r] as const),
    );

    for (const h of group.herederos) {
      const key = normName(h.nombre);
      let rel = byName.get(key);
      if (!rel) {
        rel = relatives.find((r) => {
          const n = normName(r.fullName);
          return n.includes(key) || key.includes(n);
        });
      }
      if (!rel) {
        skipped += 1;
        continue;
      }
      matched += 1;

      const data: {
        documentNumber?: string;
        phone?: string;
        mobile?: string;
        observations?: string;
      } = {};

      if (h.cedula && !rel.documentNumber) data.documentNumber = h.cedula;
      if (h.telefono && !(rel.phone || rel.mobile)) {
        data.phone = h.telefono;
        data.mobile = h.telefono;
      }
      if (h.observacion && !(rel.observations || '').trim()) {
        data.observations = h.observacion;
      }

      if (!Object.keys(data).length) continue;

      if (!dryRun) {
        await prisma.relative.update({ where: { id: rel.id }, data });
      }
      updated += 1;
      if (samples.length < 12) {
        samples.push(
          `${group.titularCedula} · ${rel.fullName} → ${Object.keys(data).join(', ')}`,
        );
      }
    }
  }

  console.log(
    JSON.stringify(
      { matched, updated, skipped, samples },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
