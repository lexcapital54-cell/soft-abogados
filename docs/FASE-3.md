# FASE 3 — Auth JWT + CRUD base

## Backend

- `POST /api/v1/auth/login` (público)
- `GET /api/v1/auth/me`
- CRUD `users`, `deceased`, `relatives`, `cases`
- Guards JWT + roles globales

## Frontend Angular

- Login
- Shell con sidebar
- Listado / detalle / creación de casos
- Interceptor Bearer token

## Credenciales demo (seed)

```
admin@lexcapital.com / Admin123!
asesor@lexcapital.com / Asesor123!
```

```bash
cd apps/api && npm run prisma:seed
```

## Probar

1. API: `npm run start:dev` en `apps/api`
2. Web: `npm start` en `apps/web`
3. Abrir http://localhost:4200 → login → casos
