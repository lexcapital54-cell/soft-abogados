import type { Request } from 'express';

/** Extrae IP del cliente (proxy-aware) */
export function clientIp(req?: Request | null): string | null {
  if (!req) return null;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || null;
  }
  return req.ip || req.socket?.remoteAddress || null;
}
