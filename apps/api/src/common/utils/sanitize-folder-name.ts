/**
 * Nomenclatura de carpetas Lex Capital.
 * Regla: /casos/{Titular_Cedula}_{Titular_Nombre_Normalizado}/
 */

/**
 * Limpia el nombre del titular para usarlo en rutas de storage.
 * Quita pipes, paréntesis, números sueltos; espacios → `_`; mayúsculas.
 *
 * @example
 * sanitizeFolderName('LUIS HERNANDO URQUIJO QUEVEDO | 2691080 (2)')
 * // → 'LUIS_HERNANDO_URQUIJO_QUEVEDO'
 */
export function sanitizeFolderName(nombre: string): string {
  let value = (nombre ?? '').trim();

  // Quitar contenido entre paréntesis: "(2)", "(copia)"
  value = value.replace(/\([^)]*\)/g, ' ');

  // Quitar pipe y todo lo que sigue (suele traer cédula duplicada)
  value = value.replace(/\|.*$/g, ' ');

  // Quitar números sueltos (cédulas / sufijos)
  value = value.replace(/\b\d+\b/g, ' ');

  // Solo letras, espacios, guiones y guion bajo
  value = value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s_-]/g, ' ');

  // Espacios / guiones → underscore
  value = value
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return value.toUpperCase();
}

/**
 * Construye la ruta de carpeta del caso (sin slash inicial ni final).
 * @example buildCaseFolderPath('2691080', 'LUIS HERNANDO… | 2691080 (2)')
 * // → 'casos/2691080_LUIS_HERNANDO_URQUIJO_QUEVEDO'
 */
export function buildCaseFolderPath(
  titularCedula: string,
  titularNombre: string,
): string {
  const cedula = String(titularCedula ?? '').replace(/\D/g, '');
  const name = sanitizeFolderName(titularNombre);
  if (!cedula || !name) {
    throw new Error(
      'No se pudo construir la carpeta: cédula o nombre del titular inválidos',
    );
  }
  return `casos/${cedula}_${name}`;
}

/**
 * Nombre de archivo seguro para storage.
 */
export function sanitizeFileName(fileName: string): string {
  const raw = (fileName ?? 'archivo').trim();
  const lastDot = raw.lastIndexOf('.');
  const base = lastDot > 0 ? raw.slice(0, lastDot) : raw;
  const ext = lastDot > 0 ? raw.slice(lastDot + 1).toLowerCase() : '';

  let cleanBase = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  if (!cleanBase) cleanBase = 'documento';

  const safeExt = ext.replace(/[^a-z0-9]/g, '').slice(0, 10);
  return safeExt ? `${cleanBase}.${safeExt}` : cleanBase;
}
