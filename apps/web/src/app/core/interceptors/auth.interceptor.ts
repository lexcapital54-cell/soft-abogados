import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

/** Solo adjuntar JWT a la API propia (no a Supabase u otros hosts). */
function isApiRequest(url: string): boolean {
  const base = environment.apiBaseUrl.replace(/\/$/, '');
  return url.startsWith(base) || url.startsWith('/api/');
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  if (!token || !isApiRequest(req.url)) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
