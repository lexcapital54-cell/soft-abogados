/**
 * Prioriza casos del Excel "casos a priorizar.xlsx" (por cédula del titular).
 * - Case.priority → HIGH (por defecto)
 * - Mantiene advisorId actual
 *
 *   cd apps/api
 *   npm run prioritize:cases:dry
 *   npm run prioritize:cases
 *
 * Opcional:
 *   --file "/ruta/casos a priorizar.xlsx"
 *   --priority CRITICAL
 */
import { resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { CasePriority, PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../.env') });

const dryRun = process.argv.includes('--dry-run');

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function dbUrl(): string {
  const base = process.env.DATABASE_URL ?? '';
  if (!base) throw new Error('Falta DATABASE_URL');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}connect_timeout=30`;
}

/** Cédulas del Excel (filas válidas: solo dígitos). */
const FALLBACK_CEDULAS = [
  '15520693',
  '73096716',
  '23606754',
  '8424889',
  '12900030',
  '7402611',
  '7216224',
  '4471748',
  '16627064',
  '9089743',
  '9084946',
  '8660899',
  '19561256',
  '9990800',
  '8429654',
  '5912153',
  '16342120',
  '12227092',
  '16584506',
  '16604973',
  '14993140',
  '5991268',
  '77013070',
  '19209713',
  '17108712',
  '7074969',
  '15985811',
  '5270876',
  '2428349',
  '19188441',
  '19172112',
  '13059265',
  '18461012',
  '91218259',
  '17313072',
  '16268047',
  '16634718',
  '9086811',
  '2550425',
  '6540651',
  '16246976',
  '3228485',
  '3076921',
  '9280853',
  '7414645',
  '73070153',
  '4053002',
  '11338133',
  '17320849',
  '9516762',
  '70557207',
  '70549656',
  '18935348',
  '73090032',
  '19136666',
  '19426420',
  '16449438',
];

function parseCedulasFromXlsx(filePath: string): string[] {
  // Preferir xlsx si está instalado (p.ej. apps/web); si no, fallar para usar fallback.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  let XLSX: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    XLSX = require('xlsx');
  } catch {
    throw new Error('Módulo xlsx no disponible');
  }
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  }) as Record<string, unknown>[];
  const out: string[] = [];
  for (const row of rows) {
    const raw =
      row['cedula '] ??
      row['cedula'] ??
      row['CEDULA'] ??
      row['Cédula'] ??
      row['documento'] ??
      '';
    const cedula = String(raw).trim();
    if (/^\d+$/.test(cedula)) out.push(cedula);
  }
  return [...new Set(out)];
}

function loadCedulas(): string[] {
  const fileArg =
    argValue('--file') ??
    process.env.PRIORITIZE_CASES_FILE ??
    '/Users/danielquintero/Downloads/casos a priorizar.xlsx';

  if (existsSync(fileArg)) {
    try {
      const fromFile = parseCedulasFromXlsx(fileArg);
      if (fromFile.length) {
        console.log(`Cédulas leídas de Excel: ${fromFile.length} (${fileArg})`);
        return fromFile;
      }
    } catch (err) {
      console.warn(
        `No se pudo leer Excel (${fileArg}): ${(err as Error).message}`,
      );
      console.warn('Usando lista embebida de cédulas.');
    }
  } else {
    console.warn(`Excel no encontrado: ${fileArg}`);
    console.warn('Usando lista embebida de cédulas.');
  }
  return FALLBACK_CEDULAS;
}

function resolvePriority(): CasePriority {
  const raw = (argValue('--priority') ?? 'HIGH').toUpperCase();
  if (!Object.values(CasePriority).includes(raw as CasePriority)) {
    throw new Error(
      `Prioridad inválida: ${raw}. Use: ${Object.values(CasePriority).join(', ')}`,
    );
  }
  return raw as CasePriority;
}

async function main() {
  const priority = resolvePriority();
  const cedulas = loadCedulas();
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl() } },
  });

  console.log(`Modo: ${dryRun ? 'DRY-RUN' : 'UPDATE'}`);
  console.log(`Prioridad destino: ${priority}`);
  console.log(`Cédulas a buscar: ${cedulas.length}`);

  const deceased = await prisma.deceased.findMany({
    where: { documentNumber: { in: cedulas } },
    select: {
      id: true,
      documentNumber: true,
      fullName: true,
      cases: {
        select: {
          id: true,
          internalCode: true,
          priority: true,
          advisorId: true,
          advisor: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  const foundDocs = new Set(deceased.map((d) => d.documentNumber));
  const missing = cedulas.filter((c) => !foundDocs.has(c));
  const caseRows = deceased.flatMap((d) =>
    d.cases.map((c) => ({
      ...c,
      documentNumber: d.documentNumber,
      fullName: d.fullName,
    })),
  );

  const already = caseRows.filter((c) => c.priority === priority);
  const toUpdate = caseRows.filter((c) => c.priority !== priority);

  console.log(`Titulares encontrados: ${deceased.length}`);
  console.log(`Casos encontrados: ${caseRows.length}`);
  console.log(`Ya en ${priority}: ${already.length}`);
  console.log(`A actualizar → ${priority}: ${toUpdate.length}`);
  if (missing.length) {
    console.log(`Cédulas sin titular en BD (${missing.length}):`);
    for (const m of missing) console.log(`  - ${m}`);
  }

  const byAdvisor = new Map<string, number>();
  for (const c of caseRows) {
    const label = c.advisor
      ? `${c.advisor.firstName} ${c.advisor.lastName}`
      : 'Sin asignar';
    byAdvisor.set(label, (byAdvisor.get(label) ?? 0) + 1);
  }
  console.log('Distribución actual por asesor:');
  for (const [name, count] of [...byAdvisor.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${name}: ${count}`);
  }

  if (!dryRun && toUpdate.length) {
    const ids = toUpdate.map((c) => c.id);
    const result = await prisma.case.updateMany({
      where: { id: { in: ids } },
      data: { priority },
    });
    console.log(`Actualizados: ${result.count}`);

    // Bitácora ligera (una actividad por caso)
    const actor =
      (await prisma.user.findFirst({
        where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, status: 'ACTIVE' },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })) ?? null;

    if (actor) {
      await prisma.caseActivity.createMany({
        data: toUpdate.map((c) => ({
          caseId: c.id,
          userId: actor.id,
          type: 'STATUS_CHANGE' as const,
          title: `Prioridad → ${priority}`,
          description: `Lista "casos a priorizar". Antes: ${c.priority}. Titular CC ${c.documentNumber}.`,
        })),
      });
    }
  }

  // Snapshot post
  const highCount = await prisma.case.count({ where: { priority: 'HIGH' } });
  const criticalCount = await prisma.case.count({
    where: { priority: 'CRITICAL' },
  });
  console.log(`Totales BD → HIGH: ${highCount} | CRITICAL: ${criticalCount}`);

  // Guarda un resumen local para auditoría operativa
  const summaryPath = resolve(__dirname, '../.tmp-prioritize-summary.json');
  try {
    const payload = {
      at: new Date().toISOString(),
      dryRun,
      priority,
      cedulas: cedulas.length,
      foundCases: caseRows.length,
      updated: dryRun ? 0 : toUpdate.length,
      missing,
      cases: caseRows.map((c) => ({
        id: c.id,
        code: c.internalCode,
        documentNumber: c.documentNumber,
        fullName: c.fullName,
        from: c.priority,
        advisor: c.advisor?.email ?? null,
      })),
    };
    // write outside sandbox may fail; ignore
    writeFileSync(summaryPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Resumen: ${summaryPath}`);
  } catch {
    // ignore
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
