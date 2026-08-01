import { Component, Input } from '@angular/core';

export type StatusBadgeKind =
  | 'ok'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'locked';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    <span
      class="badge"
      [class.badge--ok]="status === 'ok'"
      [class.badge--warning]="status === 'warning'"
      [class.badge--danger]="status === 'danger'"
      [class.badge--info]="status === 'info'"
      [class.badge--neutral]="status === 'neutral'"
      [class.badge--locked]="status === 'locked'"
    >
      {{ label }}
    </span>
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      white-space: nowrap;
      border: 1px solid transparent;
    }
    .badge--ok {
      background: #d1fae5;
      color: #047857;
      border-color: #a7f3d0;
    }
    .badge--warning {
      background: #fef3c7;
      color: #b45309;
      border-color: #fde68a;
    }
    .badge--danger {
      background: #ffe4e6;
      color: #be123c;
      border-color: #fecdd3;
    }
    .badge--info {
      background: #e0e7ff;
      color: #4338ca;
      border-color: #c7d2fe;
    }
    .badge--neutral {
      background: #f1f5f9;
      color: #64748b;
      border-color: #e2e8f0;
    }
    .badge--locked {
      background: #f8fafc;
      color: #94a3b8;
      border-color: #e2e8f0;
    }
  `,
})
export class StatusBadgeComponent {
  @Input({ required: true }) status!: StatusBadgeKind;
  @Input({ required: true }) label!: string;
}
