/**
 * Festivos Colombia (fechas fijas + comunes 2025–2027).
 * Usado para sombrear días no hábiles en el calendario.
 */
const FIXED: Array<{ m: number; d: number; name: string }> = [
  { m: 1, d: 1, name: 'Año Nuevo' },
  { m: 5, d: 1, name: 'Día del Trabajo' },
  { m: 7, d: 20, name: 'Independencia' },
  { m: 8, d: 7, name: 'Batalla de Boyacá' },
  { m: 12, d: 8, name: 'Inmaculada Concepción' },
  { m: 12, d: 25, name: 'Navidad' },
];

/** Festivos variables / lunes de traslado conocidos por año */
const BY_YEAR: Record<number, Array<{ m: number; d: number; name: string }>> = {
  2025: [
    { m: 1, d: 6, name: 'Reyes Magos' },
    { m: 3, d: 24, name: 'San José' },
    { m: 4, d: 17, name: 'Jueves Santo' },
    { m: 4, d: 18, name: 'Viernes Santo' },
    { m: 5, d: 1, name: 'Día del Trabajo' },
    { m: 6, d: 2, name: 'Ascensión' },
    { m: 6, d: 23, name: 'Corpus Christi' },
    { m: 6, d: 30, name: 'Sagrado Corazón' },
    { m: 7, d: 20, name: 'Independencia' },
    { m: 8, d: 7, name: 'Batalla de Boyacá' },
    { m: 8, d: 18, name: 'Asunción' },
    { m: 10, d: 13, name: 'Día de la Raza' },
    { m: 11, d: 3, name: 'Todos los Santos' },
    { m: 11, d: 17, name: 'Independencia de Cartagena' },
    { m: 12, d: 8, name: 'Inmaculada Concepción' },
    { m: 12, d: 25, name: 'Navidad' },
  ],
  2026: [
    { m: 1, d: 12, name: 'Reyes Magos' },
    { m: 3, d: 23, name: 'San José' },
    { m: 4, d: 2, name: 'Jueves Santo' },
    { m: 4, d: 3, name: 'Viernes Santo' },
    { m: 5, d: 18, name: 'Ascensión' },
    { m: 6, d: 8, name: 'Corpus Christi' },
    { m: 6, d: 15, name: 'Sagrado Corazón' },
    { m: 8, d: 17, name: 'Asunción' },
    { m: 10, d: 12, name: 'Día de la Raza' },
    { m: 11, d: 2, name: 'Todos los Santos' },
    { m: 11, d: 16, name: 'Independencia de Cartagena' },
  ],
  2027: [
    { m: 1, d: 11, name: 'Reyes Magos' },
    { m: 3, d: 22, name: 'San José' },
    { m: 3, d: 25, name: 'Jueves Santo' },
    { m: 3, d: 26, name: 'Viernes Santo' },
    { m: 5, d: 10, name: 'Ascensión' },
    { m: 5, d: 31, name: 'Corpus Christi' },
    { m: 6, d: 7, name: 'Sagrado Corazón' },
    { m: 8, d: 16, name: 'Asunción' },
    { m: 10, d: 18, name: 'Día de la Raza' },
    { m: 11, d: 1, name: 'Todos los Santos' },
    { m: 11, d: 15, name: 'Independencia de Cartagena' },
  ],
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export type NonWorkingDay = {
  date: string; // YYYY-MM-DD (Bogotá)
  reason: 'weekend' | 'holiday';
  label: string;
  isNonWorkingDay: true;
};

export function listNonWorkingDays(from: Date, to: Date): NonWorkingDay[] {
  const out: NonWorkingDay[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(12, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(12, 0, 0, 0);

  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    const key = `${y}-${pad(m)}-${pad(d)}`;
    const dow = cursor.getUTCDay();

    if (dow === 0 || dow === 6) {
      out.push({
        date: key,
        reason: 'weekend',
        label: dow === 0 ? 'Domingo' : 'Sábado',
        isNonWorkingDay: true,
      });
    } else {
      const yearHolidays = [
        ...FIXED,
        ...(BY_YEAR[y] ?? []),
      ];
      const hit = yearHolidays.find((h) => h.m === m && h.d === d);
      if (hit) {
        out.push({
          date: key,
          reason: 'holiday',
          label: hit.name,
          isNonWorkingDay: true,
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Deduplicate by date (fixed + BY_YEAR may overlap)
  const map = new Map<string, NonWorkingDay>();
  for (const day of out) {
    const prev = map.get(day.date);
    if (!prev || day.reason === 'holiday') map.set(day.date, day);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
