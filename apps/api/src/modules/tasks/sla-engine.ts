/**
 * Motor de semáforos SLA para tareas operativas Lex Capital.
 * Evalúa urgencia en tiempo real con días hábiles (lun–vie).
 */

export type SlaTone = 'green' | 'yellow' | 'red';

export type TaskSlaInput = {
  status: string;
  dueDate: Date | string | null | undefined;
};

export type TaskSlaResult = {
  tone: SlaTone;
  label: string;
  businessDaysRemaining: number | null;
  overdue: boolean;
};

const DONE = new Set(['COMPLETED', 'CANCELLED']);

/** Avanza un día calendario */
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Días hábiles entre `from` (hoy) y `to` (vencimiento), excluyendo el día actual
 * si ya pasó la hora; cuenta días laborables restantes hasta la fecha límite.
 * Negativo = días hábiles de atraso.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  const a = startOfDay(from);
  const b = startOfDay(to);
  if (a.getTime() === b.getTime()) return 0;

  const forward = b.getTime() > a.getTime();
  let cursor = a;
  let count = 0;
  const step = forward ? 1 : -1;
  const limit = 370; // safety
  for (let i = 0; i < limit; i++) {
    cursor = addDays(cursor, step);
    if (!isWeekend(cursor)) count += step;
    if (cursor.getTime() === b.getTime()) break;
  }
  return count;
}

export function evaluateTaskSla(
  task: TaskSlaInput,
  now: Date = new Date(),
): TaskSlaResult {
  if (DONE.has(String(task.status).toUpperCase())) {
    return {
      tone: 'green',
      label: 'En tiempo / Cerrada',
      businessDaysRemaining: null,
      overdue: false,
    };
  }

  if (!task.dueDate) {
    return {
      tone: 'green',
      label: 'Sin vencimiento',
      businessDaysRemaining: null,
      overdue: false,
    };
  }

  const due = new Date(task.dueDate);
  const days = businessDaysBetween(now, due);

  if (days < 0) {
    return {
      tone: 'red',
      label: `Vencida (${Math.abs(days)} día(s) hábil(es))`,
      businessDaysRemaining: days,
      overdue: true,
    };
  }

  if (days <= 5) {
    return {
      tone: 'yellow',
      label:
        days === 0
          ? 'Vence hoy'
          : `Alerta: ${days} día(s) hábil(es)`,
      businessDaysRemaining: days,
      overdue: false,
    };
  }

  return {
    tone: 'green',
    label: `En tiempo (${days} días hábiles)`,
    businessDaysRemaining: days,
    overdue: false,
  };
}

/** Etiquetas UI de tipología operativa */
export const TASK_TYPE_LABELS: Record<string, string> = {
  BUSCAR_NUEVOS_FAMILIARES: 'Buscar nuevos familiares',
  OBTENER_UBICAS_DATOS_CONTACTO: 'Obtener/ubicar datos de contacto',
  ACTUALIZAR_INFO_HEREDEROS: 'Actualizar info. herederos',
  SOLICITAR_REGISTROS_CIVILES: 'Solicitar registros civiles',
  AUTENTICAR_PODERES: 'Autenticar poderes',
  VERIFICAR_PAZ_Y_SALVO: 'Verificar paz y salvo',
  REVISION_JURIDICA_PREVIA: 'Revisión jurídica previa',
  RADICAR_DEMANDA_O_CASO: 'Radicar demanda o caso',
  SEGUIMIENTO_TRAMITE_JUZGADO: 'Seguimiento trámite juzgado',
  NEGOCIACION_ENTIDAD: 'Negociación con entidad',
  LIQUIDACION_HONORARIOS: 'Liquidación de honorarios',
  OTRO: 'Otro',
};

export function taskTypeLabel(code: string | null | undefined): string {
  if (!code) return TASK_TYPE_LABELS.OTRO;
  return TASK_TYPE_LABELS[code] ?? code;
}
