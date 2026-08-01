# FASE 2 — Bootstrap NestJS + Angular

**Estado:** proyectos reales creados. Falta configurar `DATABASE_URL` y correr migraciones.

## Hecho

- `apps/api` — NestJS 11 + Prisma 6 + `PrismaService` global
- `apps/web` — Angular 21 (standalone) con shell LexCapital
- Health: `GET /api/v1/health`
- Estructura de módulos de dominio preparada (vacía, lista para FASE 3)

## Pendiente (necesita tu Postgres)

1. Crear DB: `createdb lexcapital`
2. Copiar `.env.example` → `apps/api/.env` y poner tu usuario/clave
3. `cd apps/api && npm run prisma:migrate`

## Siguiente fase (FASE 3)

- Auth JWT (login / roles)
- CRUD Usuarios + Casos + Fallecidos + Familiares
- Conectar Angular al API
