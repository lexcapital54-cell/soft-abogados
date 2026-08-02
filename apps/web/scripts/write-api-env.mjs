/**
 * Escribe environment.production.ts con la URL de API.
 * Netlify: define NG_APP_API_BASE_URL en Environment variables.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = (
  process.env.NG_APP_API_BASE_URL ||
  'https://lexcapital-api.onrender.com/api/v1'
).trim().replace(/\/$/, '');

const target = resolve(__dirname, '../src/environments/environment.production.ts');
const contents = `/**
 * Generado en build (scripts/write-api-env.mjs).
 * Override: NG_APP_API_BASE_URL
 */
export const environment = {
  production: true,
  apiBaseUrl: ${JSON.stringify(url)},
};
`;

writeFileSync(target, contents, 'utf8');
console.log(`[write-api-env] apiBaseUrl → ${url}`);
