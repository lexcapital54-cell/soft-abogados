/**
 * Sube apps/api/storage → Supabase Storage y actualiza storageUrl en Neon.
 *
 * Requisitos (.env):
 *   DATABASE_URL
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_STORAGE_BUCKET=lexcapital-docs  (bucket público)
 *
 * Uso:
 *   cd apps/api
 *   npx ts-node --project scripts/tsconfig.json scripts/upload-storage-to-supabase.ts
 *   npx ts-node --project scripts/tsconfig.json scripts/upload-storage-to-supabase.ts --dry-run
 *   npx ts-node --project scripts/tsconfig.json scripts/upload-storage-to-supabase.ts --limit=20
 */
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../.env') });

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) || null : null;

const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'lexcapital-docs';
const storageRoot = resolve(
  process.env.STORAGE_ROOT?.trim() || join(__dirname, '../storage'),
);

const prisma = new PrismaClient();

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, acc);
    else if (name !== '.keep' && name !== '.gitkeep') acc.push(full);
  }
  return acc;
}

function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

async function uploadOne(storageKey: string, absolute: string): Promise<void> {
  const buffer = await readFile(absolute);
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${storageKey}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
      'Content-Type': guessMime(absolute),
      'x-upsert': 'true',
    },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${res.status} ${detail}`);
  }
}

async function main() {
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      'Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en apps/api/.env',
    );
    process.exit(1);
  }

  console.log(`Storage local: ${storageRoot}`);
  console.log(`Supabase:      ${supabaseUrl} / bucket ${bucket}`);
  console.log(`Modo:         ${dryRun ? 'DRY-RUN' : 'UPLOAD'}`);

  let files = walkFiles(storageRoot);
  if (limit) files = files.slice(0, limit);
  console.log(`Archivos:     ${files.length}`);

  let ok = 0;
  let fail = 0;
  const publicBase = `${supabaseUrl}/storage/v1/object/public/${bucket}`;

  for (const absolute of files) {
    const storageKey = relative(storageRoot, absolute).replace(/\\/g, '/');
    try {
      if (!dryRun) {
        await uploadOne(storageKey, absolute);
        await prisma.document.updateMany({
          where: { storageKey },
          data: { storageUrl: `${publicBase}/${storageKey}` },
        });
      }
      ok++;
      if (ok % 25 === 0) console.log(`  … ${ok}/${files.length}`);
    } catch (e) {
      fail++;
      console.error(`FAIL ${storageKey}: ${(e as Error).message}`);
    }
  }

  console.log('—— Resumen ——');
  console.log(`  OK:    ${ok}`);
  console.log(`  FAIL:  ${fail}`);
  if (dryRun) console.log('  DRY-RUN: no se subió nada.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
