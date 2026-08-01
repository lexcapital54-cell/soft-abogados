import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Acceso estricto a compliance: solo SUPER_ADMIN */
export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated() && auth.isComplianceAdmin()) {
    return true;
  }
  return router.createUrlTree(['/dashboard']);
};
