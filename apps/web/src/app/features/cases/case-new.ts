import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CasesApiService } from '../../core/services/cases-api.service';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-case-new',
  imports: [ReactiveFormsModule],
  templateUrl: './case-new.html',
  styleUrl: './case-new.css',
})
export class CaseNewPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CasesApiService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    documentNumber: ['', [Validators.required, Validators.minLength(3)]],
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    city: [''],
    department: [''],
    recoverableValue: [0, [Validators.min(0)]],
    estimatedFees: [0, [Validators.min(0)]],
    observations: [''],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();

    this.api
      .createDeceased({
        documentNumber: value.documentNumber,
        fullName: value.fullName,
        city: value.city || undefined,
        department: value.department || undefined,
        observations: value.observations || undefined,
      })
      .pipe(
        switchMap((deceased) =>
          this.api.createCase({
            deceasedId: deceased.id,
            recoverableValue: Number(value.recoverableValue) || 0,
            estimatedFees: Number(value.estimatedFees) || 0,
            city: value.city || undefined,
            department: value.department || undefined,
            observations: value.observations || undefined,
          }),
        ),
      )
      .subscribe({
        next: (created) => {
          this.loading.set(false);
          const id = (created as { id: string }).id;
          void this.router.navigateByUrl(`/cases/${id}`);
        },
        error: (err) => {
          this.loading.set(false);
          const msg =
            err?.error?.message ??
            'No se pudo crear el caso (¿cédula duplicada?)';
          this.error.set(Array.isArray(msg) ? msg.join(', ') : String(msg));
        },
      });
  }
}
