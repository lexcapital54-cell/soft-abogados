import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Bloquea ASESOR; permite SUPER_ADMIN, ADMIN, CEO, DIRECTOR_JURIDICO */
export const managersGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated() && auth.isSuperAdmin()) {
    return true;
  }
  return router.createUrlTree(['/dashboard']);
};
