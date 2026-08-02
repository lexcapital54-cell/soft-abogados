# Despliegue: Neon + Render + Netlify

## Arquitectura

```
Netlify (Angular)  →  Render (NestJS API)  →  Neon (PostgreSQL)
                              ↓
                     Supabase Storage (docs, opcional)
```

## 1. Neon

1. Crear proyecto en [neon.tech](https://neon.tech).
2. Copiar `DATABASE_URL` (con `?sslmode=require`).
3. Desde tu máquina:

```bash
cd apps/api
export DATABASE_URL="postgresql://...@...neon.tech/neondb?sslmode=require"
npx prisma migrate deploy
npx prisma db seed   # opcional
```

## 2. Render (API)

1. New → Web Service → repo `soft-abogados`.
2. **Root Directory:** `apps/api`
3. **Build:** `npm ci && npx prisma generate && npm run build`
4. **Start:** `npx prisma migrate deploy && npm run start:prod`
5. Variables:

| Variable | Ejemplo |
|----------|---------|
| `DATABASE_URL` | (Neon) |
| `NODE_ENV` | `production` |
| `API_PREFIX` | `api/v1` |
| `JWT_SECRET` | (aleatorio largo) |
| `JWT_EXPIRES_IN` | `8h` |
| `CORS_ORIGIN` | `https://TU-SITIO.netlify.app` |
| `STORAGE_DRIVER` | `local` (demo) o `supabase` (prod) |

6. Anota la URL: `https://lexcapital-api.onrender.com` (o la que asigne Render).
7. Health: `GET /api/v1/health`

También puedes usar el Blueprint `render.yaml` en la raíz.

## 3. Netlify (Web)

1. Importar el mismo repo.
2. Usa el `netlify.toml` de la raíz (base `apps/web`).
3. Variable de entorno:

| Variable | Valor |
|----------|--------|
| `NG_APP_API_BASE_URL` | `https://TU-API.onrender.com/api/v1` |

4. Publish dir: `dist/web/browser` (SPA redirects ya incluidos).

## 4. Documentos persistentes (Supabase)

En Render el disco es **efímero**. Para no perder PDFs:

1. Proyecto en [supabase.com](https://supabase.com) → Storage → bucket público `lexcapital-docs`.
2. En Render:

```env
STORAGE_DRIVER=supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=lexcapital-docs
STORAGE_PUBLIC_BASE=https://TU-API.onrender.com/api/v1/documents/file
```

Sin Supabase, `STORAGE_DRIVER=local` sirve para demo; los archivos pueden borrarse al redeploy.

## Checklist

- [ ] Neon migrate + seed
- [ ] Render API up + health OK
- [ ] `CORS_ORIGIN` = URL Netlify
- [ ] Netlify `NG_APP_API_BASE_URL` = URL Render
- [ ] Login desde el sitio Netlify
- [ ] (Opcional) Supabase Storage
