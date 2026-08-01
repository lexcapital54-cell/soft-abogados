/**
 * Navegación del shell con control RBAC estricto.
 * Cada ítem declara `roles` permitidos; el sidebar filtra antes del render.
 */

export type AppRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CEO'
  | 'DIRECTOR_JURIDICO'
  | 'ASESOR';

/** Roles de dirección / plataforma (acceso amplio al menú) */
export const MANAGER_ROLES: AppRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'CEO',
  'DIRECTOR_JURIDICO',
];

/** Ítems visibles para asesores + managers */
export const ADVISOR_AND_MANAGERS: AppRole[] = [
  ...MANAGER_ROLES,
  'ASESOR',
];

export type NavItem = {
  label: string;
  path: string;
  icon:
    | 'layout'
    | 'briefcase'
    | 'user'
    | 'users'
    | 'check'
    | 'chart'
    | 'calendar'
    | 'file'
    | 'report'
    | 'gauge'
    | 'building'
    | 'settings'
    | 'shield'
    | 'git'
    | 'folder';
  badge?: number;
  /** Roles autorizados a ver y navegar este ítem */
  roles: AppRole[];
};

/**
 * ASESOR: Dashboard, Casos, Tareas, Calendario, Reportes.
 * SUPER_ADMIN (+ managers): menú completo.
 * Auditoría: solo SUPER_ADMIN.
 */
export const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'layout',
    roles: ADVISOR_AND_MANAGERS,
  },
  {
    label: 'Mis Casos',
    path: '/cases',
    icon: 'briefcase',
    roles: ADVISOR_AND_MANAGERS,
  },
  {
    label: 'Cruce IA',
    path: '/cruce-datos',
    icon: 'git',
    roles: MANAGER_ROLES,
  },
  {
    label: 'Fallecidos',
    path: '/deceased',
    icon: 'user',
    roles: MANAGER_ROLES,
  },
  {
    label: 'Familiares',
    path: '/relatives',
    icon: 'users',
    roles: MANAGER_ROLES,
  },
  {
    label: 'Tareas',
    path: '/tasks',
    icon: 'check',
    roles: ADVISOR_AND_MANAGERS,
  },
  {
    label: 'Indicadores',
    path: '/indicators',
    icon: 'gauge',
    roles: ['SUPER_ADMIN'],
  },
  {
    label: 'Calendario',
    path: '/calendar',
    icon: 'calendar',
    roles: ADVISOR_AND_MANAGERS,
  },
  {
    label: 'Carpeta Corporativa',
    path: '/repositorio',
    icon: 'folder',
    roles: ADVISOR_AND_MANAGERS,
  },
  {
    label: 'Documentos',
    path: '/documents',
    icon: 'file',
    roles: MANAGER_ROLES,
  },
  {
    label: 'Reportes',
    path: '/reports',
    icon: 'report',
    roles: ADVISOR_AND_MANAGERS,
  },
  {
    label: 'Clientes',
    path: '/clients',
    icon: 'building',
    roles: MANAGER_ROLES,
  },
  {
    label: 'Auditoría',
    path: '/auditoria',
    icon: 'shield',
    roles: ['SUPER_ADMIN'],
  },
  {
    label: 'Ajustes',
    path: '/settings',
    icon: 'settings',
    roles: MANAGER_ROLES,
  },
];

export function canAccessPath(
  role: string | null | undefined,
  path: string,
): boolean {
  if (!role) return false;
  const item = navItems.find(
    (n) => path === n.path || path.startsWith(`${n.path}/`),
  );
  if (!item) return true; // rutas no listadas (p. ej. cases/:id) → deja authGuard
  return item.roles.includes(role as AppRole);
}

export function navVisibleForRole(role: string | null | undefined): NavItem[] {
  if (!role) return [];
  return navItems.filter((item) => item.roles.includes(role as AppRole));
}
