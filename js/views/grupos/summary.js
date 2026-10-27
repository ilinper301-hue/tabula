// Tabula · Grupos · cálculos de asistencia (funciones puras salvo la lectura del store)
import { store } from '../../store.js';
import { currentSchoolYear } from '../../school.js';
import { MESES, fromISO, toISO } from '../../ui.js';
import { cap } from './common.js';

/** Rango de fechas del curso escolar '2026-27' → septiembre a agosto. */
export function yearRange(cursoEscolar) {
  const m = /^(\d{4})-(\d{2})$/.exec(cursoEscolar || '') || /^(\d{4})-(\d{2})$/.exec(currentSchoolYear());
  const y = Number(m[1]);
  return { start: `${y}-09-01`, end: `${y + 1}-08-31`, startYear: y };
}

/** Registros de asistencia de un grupo dentro de su curso escolar, ordenados por fecha. */
export function groupDocs(group) {
  const { start, end } = yearRange(group.cursoEscolar);
  return store.list('attendance')
    .filter((a) => a.groupId === group.id && a.fecha >= start && a.fecha <= end)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Totales de un alumno. Los días registrados cuentan como Presente salvo que conste otra cosa. */
export function studentStats(docs, studentId) {
  let faltas = 0, retrasos = 0, justificadas = 0;
  for (const d of docs) {
    const st = d.registros?.[studentId] || 'P';
    if (st === 'F') faltas++; else if (st === 'R') retrasos++; else if (st === 'J') justificadas++;
  }
  const dias = docs.length;
  // Los retrasos cuentan como asistencia; faltas y justificadas, no.
  const pct = dias ? Math.round(((dias - faltas - justificadas) / dias) * 100) : null;
  return { faltas, retrasos, justificadas, dias, pct };
}

/** Meses ('YYYY-MM') del curso escolar, de septiembre a agosto, con su etiqueta. */
export function monthsOfYear(cursoEscolar) {
  const { startYear } = yearRange(cursoEscolar);
  return Array.from({ length: 12 }, (_, i) => {
    const m = (8 + i) % 12; // 8 = septiembre
    const y = startYear + (8 + i >= 12 ? 1 : 0);
    return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${cap(MESES[m])} ${y}` };
  });
}

/** Todas las fechas ISO de un mes 'YYYY-MM'. */
export function daysOfMonth(key) {
  const [y, m] = key.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => toISO(new Date(y, m - 1, i + 1)));
}

export const isWeekend = (iso) => { const d = fromISO(iso).getDay(); return d === 0 || d === 6; };
