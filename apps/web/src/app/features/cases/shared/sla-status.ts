export type SlaTone = 'ok' | 'warning' | 'danger' | 'neutral';

export type SlaStatus = {
  tone: SlaTone;
  label: string;
  daysLeft: number | null;
};

/** Semáforo: verde al día, naranja ≤3 días, rojo vencido */
export function resolveSlaStatus(
  dueAt: string | Date | null | undefined,
  options?: { delivered?: boolean },
): SlaStatus {
  if (options?.delivered) {
    return { tone: 'ok', label: 'Entregado', daysLeft: null };
  }
  if (!dueAt) {
    return { tone: 'neutral', label: 'Sin SLA', daysLeft: null };
  }

  const due = new Date(dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const daysLeft = Math.round(
    (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysLeft < 0) {
    return {
      tone: 'danger',
      label: `Vencido (${Math.abs(daysLeft)}d)`,
      daysLeft,
    };
  }
  if (daysLeft <= 3) {
    return {
      tone: 'warning',
      label: daysLeft === 0 ? 'Vence hoy' : `Próximo (${daysLeft}d)`,
      daysLeft,
    };
  }
  return { tone: 'ok', label: `Al día (${daysLeft}d)`, daysLeft };
}

export function stageProgress(stage: string): {
  documentation: number;
  management: number;
  judicial: number;
} {
  const order = [
    'RECEPCION',
    'CONTACTO',
    'DOCUMENTACION',
    'ANALISIS',
    'NEGOCIACION',
    'ACUERDO',
    'JUDICIAL',
    'COBRO',
    'CERRADO',
    'ARCHIVO',
  ];
  const idx = Math.max(0, order.indexOf((stage || '').toUpperCase()));
  const pct = Math.round(((idx + 1) / order.length) * 100);
  return {
    documentation: Math.min(100, Math.round(pct * 1.1)),
    management: pct,
    judicial: stage?.toUpperCase() === 'JUDICIAL' || idx >= 6 ? pct : Math.max(0, pct - 40),
  };
}
