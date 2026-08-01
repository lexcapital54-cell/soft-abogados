import { Component, inject } from '@angular/core';
import { CasesListPage } from './cases-list';

@Component({
  selector: 'app-cases-hub',
  imports: [CasesListPage],
  template: `<app-cases-list />`,
})
export class CasesHubPage {
  // Hub unificado: todos los roles ven la lista real de la API
  // (la API ya filtra por asesor asignado cuando corresponde).
}
