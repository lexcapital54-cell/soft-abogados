import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  LucideUser,
  LucideLock,
  LucideArrowRight,
  LucideShield,
  LucideUserX,
  LucideLoaderCircle,
} from '@lucide/angular';
import { AuthService } from '../../core/auth/auth.service';
import {
  CONSULTANTS,
  ConsultantProfile,
} from '../../core/config/consultants.config';

@Component({
  selector: 'app-consultant-portal',
  imports: [
    FormsModule,
    RouterLink,
    LucideUser,
    LucideLock,
    LucideArrowRight,
    LucideShield,
    LucideUserX,
    LucideLoaderCircle,
  ],
  templateUrl: './consultant-portal.html',
  styleUrl: './consultant-portal.css',
})
export class ConsultantPortalPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly consultants = CONSULTANTS;
  readonly selectedId = signal<string | null>(null);
  readonly pin = signal('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal(false);

  select(profile: ConsultantProfile): void {
    if (profile.vacant || profile.status !== 'ACTIVE') return;
    this.error.set(null);
    this.success.set(false);
    this.pin.set('');
    this.selectedId.set(
      this.selectedId() === profile.id ? null : profile.id,
    );
  }

  isSelected(id: string): boolean {
    return this.selectedId() === id;
  }

  submit(profile: ConsultantProfile): void {
    if (!profile.email || profile.vacant) return;
    const pin = this.pin().trim();
    if (pin.length < 4) {
      this.error.set('Ingrese un PIN de 4 dígitos');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    // Pequeño delay UX + login real contra API
    window.setTimeout(() => {
      this.auth.login(profile.email!, pin).subscribe({
        next: () => {
          this.success.set(true);
          this.loading.set(false);
          window.setTimeout(() => {
            void this.router.navigateByUrl('/dashboard');
          }, 500);
        },
        error: (err) => {
          this.loading.set(false);
          const status = err?.status;
          if (status === 0) {
            this.error.set('No se pudo conectar con el servidor. Verifique que la API esté en marcha.');
          } else if (status === 400) {
            this.error.set('PIN inválido (debe tener 4 dígitos).');
          } else {
            this.error.set('PIN incorrecto. Intente de nuevo.');
          }
        },
      });
    }, 700);
  }

  onPinInput(value: string): void {
    this.pin.set(value.replace(/\D/g, '').slice(0, 4));
    this.error.set(null);
  }
}
