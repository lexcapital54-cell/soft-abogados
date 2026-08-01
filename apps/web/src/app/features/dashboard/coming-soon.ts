import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-coming-soon',
  imports: [RouterLink],
  template: `
    <div
      class="rounded-xl border border-slate-100 bg-white p-10 text-center shadow-sm"
    >
      <h2 class="text-lg font-semibold text-slate-800">Módulo en construcción</h2>
      <p class="mt-2 text-sm text-slate-500">
        Esta sección formará parte de las próximas fases del CRM Lex Capital.
      </p>
      <a
        routerLink="/dashboard"
        class="mt-6 inline-flex rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white"
      >
        Volver al Dashboard
      </a>
    </div>
  `,
})
export class ComingSoonPage {}
