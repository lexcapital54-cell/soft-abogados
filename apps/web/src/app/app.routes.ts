import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { managersGuard } from './core/auth/managers.guard';
import { superAdminGuard } from './core/auth/super-admin.guard';
import {
  ADVISOR_AND_MANAGERS,
  MANAGER_ROLES,
} from './core/config/nav.config';

const managerOnlyComingSoon = [
  'deceased',
  'relatives',
  'advisors',
  'documents',
  'clients',
  'settings',
] as const;

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'consultores',
  },
  {
    path: 'consultores',
    loadComponent: () =>
      import('./features/auth/consultant-portal').then(
        (m) => m.ConsultantPortalPage,
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/layout/shell').then((m) => m.ShellLayout),
    children: [
      {
        path: 'dashboard',
        canActivate: [roleGuard],
        data: { roles: ADVISOR_AND_MANAGERS },
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'cases',
        canActivate: [roleGuard],
        data: { roles: ADVISOR_AND_MANAGERS },
        loadComponent: () =>
          import('./features/cases/cases-hub').then((m) => m.CasesHubPage),
      },
      {
        path: 'cases/new',
        canActivate: [roleGuard],
        data: { roles: ADVISOR_AND_MANAGERS },
        loadComponent: () =>
          import('./features/cases/case-new').then((m) => m.CaseNewPage),
      },
      {
        path: 'cases/:id',
        canActivate: [roleGuard],
        data: { roles: ADVISOR_AND_MANAGERS },
        loadComponent: () =>
          import('./features/cases/case-detail').then((m) => m.CaseDetailPage),
      },
      {
        path: 'auditoria',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./features/admin/audit-trail').then((m) => m.AuditTrailPage),
      },
      {
        path: 'cruce-datos',
        canActivate: [managersGuard],
        loadComponent: () =>
          import('./features/kinship/kinship-matching').then(
            (m) => m.KinshipMatchingPage,
          ),
      },
      {
        path: 'tasks',
        canActivate: [roleGuard],
        data: { roles: ADVISOR_AND_MANAGERS },
        loadComponent: () =>
          import('./features/tasks/tasks-board').then((m) => m.TasksBoardPage),
      },
      {
        path: 'calendar',
        canActivate: [roleGuard],
        data: { roles: ADVISOR_AND_MANAGERS },
        loadComponent: () =>
          import('./features/calendar/calendar-page').then(
            (m) => m.CalendarPage,
          ),
      },
      {
        path: 'repositorio',
        canActivate: [roleGuard],
        data: { roles: ADVISOR_AND_MANAGERS },
        loadComponent: () =>
          import('./features/repository/repository-page').then(
            (m) => m.RepositoryPage,
          ),
      },
      {
        path: 'reports',
        canActivate: [roleGuard],
        data: { roles: ADVISOR_AND_MANAGERS },
        loadComponent: () =>
          import('./features/reports/reports-page').then(
            (m) => m.ReportsPage,
          ),
      },
      {
        path: 'indicators',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./features/kpis/indicators-page').then(
            (m) => m.IndicatorsPage,
          ),
      },
      ...managerOnlyComingSoon.map((path) => ({
        path,
        canActivate: [roleGuard],
        data: { roles: MANAGER_ROLES },
        loadComponent: () =>
          import('./features/dashboard/coming-soon').then(
            (m) => m.ComingSoonPage,
          ),
      })),
    ],
  },
  { path: '**', redirectTo: 'consultores' },
];
