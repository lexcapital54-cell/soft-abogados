/**
 * Rebalanceo de carga:
 * 1) Casos sin asesor (Sin Asignar) → Asesor 5
 * 2) Casos actuales del Asesor 5 (con familiares) → redistribuir entre Asesores 1–4
 *
 *   cd apps/api
 *   npm run rebalance:advisors:dry
 *   npm run rebalance:advisors
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../.env') });

const dryRun = process.argv.includes('--dry-run');

function dbUrl(): string {
  const base = process.env.DATABASE_URL ?? '';
  if (!base) throw new Error('Falta DATABASE_URL');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}connect_timeout=30`;
}

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl() } },
  });

  const advisors = await prisma.user.findMany({
    where: { role: 'ASESOR' },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const byEmail = new Map(advisors.map((a) => [a.email, a]));
  const asesor5 = byEmail.get('asesor@lexcapital.com');
  const others = [
    byEmail.get('luisafmorales@lexcapital.com.co'), // Asesor 1
    byEmail.get('victorjpedroso@lexcapital.com.co'), // Asesor 2
    byEmail.get('johanagomez@lexcapital.com.co'), // Asesor 3
    byEmail.get('michelleaguilar@lexcapital.com.co'), // Asesor 4
  ].filter(Boolean) as Array<{ id: string; email: string; firstName: string }>;

  if (!asesor5 || others.length !== 4) {
    throw new Error('No se encontraron los 5 asesores esperados');
  }

  console.log(`Modo: ${dryRun ? 'DRY-RUN' : 'UPDATE'}`);
  console.log(`Asesor 5: ${asesor5.email}`);
  console.log(
    `Destinos: ${others.map((a) => `${a.firstName} <${a.email}>`).join(', ')}`,
  );

  const unassigned = await prisma.case.findMany({
    where: { advisorId: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  const a5WithFamily = await prisma.case.findMany({
    where: {
      advisorId: asesor5.id,
      relatives: { some: {} },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Sin asignar → Asesor 5: ${unassigned.length}`);
  console.log(`Asesor 5 con familiares → redistribuir: ${a5WithFamily.length}`);

  const buckets: string[][] = others.map(() => []);
  a5WithFamily.forEach((c, i) => {
    buckets[i % others.length].push(c.id);
  });

  for (let i = 0; i < others.length; i++) {
    console.log(`  → ${others[i].firstName}: ${buckets[i].length} casos`);
  }

  if (!dryRun) {
    // 1) Redistribuir cartera actual del Asesor 5
    for (let i = 0; i < others.length; i++) {
      const ids = buckets[i];
      if (!ids.length) continue;
      await prisma.case.updateMany({
        where: { id: { in: ids } },
        data: { advisorId: others[i].id },
      });
      await prisma.relative.updateMany({
        where: { caseId: { in: ids } },
        data: { advisorId: others[i].id },
      });
    }

    // 2) Sin asignar → Asesor 5
    if (unassigned.length) {
      const ids = unassigned.map((c) => c.id);
      await prisma.case.updateMany({
        where: { id: { in: ids } },
        data: { advisorId: asesor5.id },
      });
      await prisma.relative.updateMany({
        where: { caseId: { in: ids } },
        data: { advisorId: asesor5.id },
      });
    }
  }

  const final = await prisma.case.groupBy({
    by: ['advisorId'],
    _count: { _all: true },
  });
  const nameById = new Map(
    advisors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]),
  );
  console.log('Totales actuales:');
  for (const row of final) {
    const label = row.advisorId
      ? nameById.get(row.advisorId) ?? row.advisorId
      : 'SIN ASESOR';
    console.log(`  ${label}: ${row._count._all}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
