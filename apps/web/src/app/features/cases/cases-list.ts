import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideChevronsLeft,
  LucideChevronsRight,
} from '@lucide/angular';
import {
  CaseListItem,
  CasesApiService,
} from '../../core/services/cases-api.service';
import {
  AppUser,
  UsersApiService,
} from '../../core/services/users-api.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-cases-list',
  imports: [
    FormsModule,
    RouterLink,
    CurrencyPipe,
    LucideChevronLeft,
    LucideChevronRight,
    LucideChevronsLeft,
    LucideChevronsRight,
  ],
  templateUrl: './cases-list.html',
  styleUrl: './cases-list.css',
})
export class CasesListPage implements OnInit {
  private readonly api = inject(CasesApiService);
  private readonly usersApi = inject(UsersApiService);
  readonly auth = inject(AuthService);

  readonly items = signal<CaseListItem[]>([]);
  readonly advisors = signal<AppUser[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly totalPages = signal(1);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  search = '';
  advisorId = '';

  readonly rangeLabel = computed(() => {
    const total = this.total();
    if (!total) return '0 resultados';
    const from = (this.page() - 1) * this.pageSize() + 1;
    const to = Math.min(this.page() * this.pageSize(), total);
    return `${from}–${to} de ${total}`;
  });

  readonly pages = computed(() => {
    const current = this.page();
    const last = this.totalPages();
    const window = 5;
    let start = Math.max(1, current - Math.floor(window / 2));
    let end = Math.min(last, start + window - 1);
    start = Math.max(1, end - window + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });

  ngOnInit(): void {
    if (this.auth.isSuperAdmin()) {
      this.usersApi.list().subscribe({
        next: (users) =>
          this.advisors.set(users.filter((u) => u.role === 'ASESOR')),
        error: () => this.advisors.set([]),
      });
    }
    this.load();
  }

  load(resetPage = false): void {
    if (resetPage) this.page.set(1);
    this.loading.set(true);
    this.error.set(null);
    this.api
      .list({
        search: this.search.trim() || undefined,
        page: this.page(),
        pageSize: this.pageSize(),
        advisorId:
          this.auth.isSuperAdmin() && this.advisorId
            ? this.advisorId
            : undefined,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.page.set(res.page);
          this.pageSize.set(res.pageSize);
          this.totalPages.set(res.totalPages);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('No se pudieron cargar los casos');
        },
      });
  }

  goTo(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  changePageSize(size: string | number): void {
    this.pageSize.set(Number(size));
    this.page.set(1);
    this.load();
  }

  changeAdvisor(id: string): void {
    this.advisorId = id;
    this.load(true);
  }
}
