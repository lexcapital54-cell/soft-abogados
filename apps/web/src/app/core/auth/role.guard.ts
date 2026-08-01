import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import type { AppRole } from '../config/nav.config';

/**
 * Guard genérico: exige que el rol de sesión esté en `route.data.roles`.
 * Asesor bloqueado → redirección a /cases (según política RBAC del sidebar).
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowed = (route.data['roles'] as AppRole[] | undefined) ?? [];
  const role = auth.user()?.role as AppRole | undefined;

  if (!auth.isAuthenticated() || !role) {
    return router.createUrlTree(['/login']);
  }
  if (allowed.length === 0 || allowed.includes(role)) {
    return true;
  }
  return router.createUrlTree(['/cases']);
};
