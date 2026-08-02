# LexCapital Group

CRM jurídico — **Angular + NestJS + PostgreSQL**

## Estado

| Fase | Contenido | Estado |
|------|-----------|--------|
| 1 | Schema Prisma | OK |
| 2 | Nest + Angular + DB | OK |
| 3 | Auth JWT + CRUD casos | OK |

## Arranque

```bash
# API
cd apps/api && npm run start:dev

# Web
cd apps/web && npm start
```

- Web: http://localhost:4200
- API: http://localhost:3000/api/v1/health

### Login demo

```
admin@lexcapital.com / Admin123!
asesor@lexcapital.com / Asesor123!
```

## Docs

Ver `docs/FASE-1.md`, `docs/FASE-2.md`, `docs/FASE-3.md`.

## Despliegue (Neon + Render + Netlify)

Guía paso a paso: [`docs/DEPLOY.md`](docs/DEPLOY.md).
