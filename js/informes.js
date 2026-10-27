// Tabula · exportación a Séneca, informes para familias y rúbricas por criterio (lógica pura).

import { toLevel, round1, LEVELS, LEVEL_LABELS } from './grading.js';

// ---------- Séneca ----------
/**
 * Calificación para Séneca: número entero 1–10 y su término (IN 1–4, SU 5, BI 6, NT 7–8, SB 9–10).
 * Se redondea al entero más próximo sin cambiar de nivel: un 4,6 queda en 4 (IN), no sube a SU.
 */
export function senecaGrade(nota) {
  if (typeof nota !== 'number' || !Number.isFinite(nota)) return null;
  const lvl = toLevel(nota);
  const range = { IN: [1, 4], SU: [5, 5], BI: [6, 6], NT: [7, 8], SB: [9, 10] }[lvl];
  const num = Math.min(range[1], Math.max(range[0], Math.round(nota)));
  return { num, cal: lvl };
}

const fullName = (s) => [s.apellidos, s.nombre].filter(Boolean).join(', ');

/**
 * Resumen del grupo para pasar a Séneca: una fila por alumno, una columna por área.
 * @param students [{id, nombre, apellidos}]  (en el orden de la lista)
 * @param areas    [{ area, results: { [studentId]: { nota } } }]
 * @param withLevel añade la columna del término (IN…SB) junto a cada nota
 */
export function senecaSummaryRows(students, areas, { withLevel = true } = {}) {
  const head = ['N.º', 'Alumno/a'];
  for (const a of areas) { head.push(a.area); if (withLevel) head.push(''); }
  const rows = [head];
  students.forEach((s, i) => {
    const r = [String(i + 1), fullName(s)];
    for (const a of areas) {
      const g = senecaGrade(a.results?.[s.id]?.nota);
      r.push(g ? String(g.num) : '');
      if (withLevel) r.push(g ? g.cal : '');
    }
    rows.push(r);
  });
  return rows;
}

/**
 * Detalle de un área por criterios (para la evaluación por criterios de Séneca).
 * @param criterios [{id, codigo}]
 * @param results { [studentId]: { nota, porCriterio: {[criterioId]: nota} } }
 * @param escala 'numerica' (1 decimal) | 'niveles' (IN…SB) | 'seneca' (1–5, como el cuaderno de Séneca)
 */
export function senecaCriteriaRows(students, criterios, results, { escala = 'numerica' } = {}) {
  const fmt = (n) => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '';
    if (escala === 'niveles') return toLevel(n);
    if (escala === 'seneca') return String(LEVELS.indexOf(toLevel(n)) + 1);
    return String(round1(n)).replace('.', ',');
  };
  const rows = [['N.º', 'Alumno/a', ...criterios.map((c) => c.codigo || '—'), 'Calificación', '']];
  students.forEach((s, i) => {
    const r = results?.[s.id] || {};
    const g = senecaGrade(r.nota);
    rows.push([String(i + 1), fullName(s), ...criterios.map((c) => fmt(r.porCriterio?.[c.id])), g ? String(g.num) : '', g ? g.cal : '']);
  });
  return rows;
}

/** CSV para Excel en español (separador «;», BOM UTF-8). */
export function toCSV(rows) {
  const q = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
}

// ---------- Informes para familias ----------
/** Banco de comentarios. {nombre} se sustituye por el nombre del alumno o alumna. Redacción neutra. */
export const COMENTARIOS = {
  logros: [
    '{nombre} ha trabajado con constancia y ha avanzado mucho este trimestre.',
    '{nombre} participa con interés en clase y se esfuerza en sus tareas.',
    'Ha mejorado notablemente en lectura y en la presentación de sus trabajos.',
    'Muestra autonomía y responsabilidad en su trabajo diario.',
    'Se relaciona muy bien con sus compañeros y compañeras y colabora en los trabajos en grupo.',
    'Muestra mucha curiosidad y creatividad en las tareas que se proponen.',
  ],
  mejorar: [
    'Debe seguir reforzando la lectura en voz alta y la comprensión de textos.',
    'Conviene seguir practicando el cálculo mental y las operaciones básicas.',
    'Necesita cuidar la letra y la presentación de sus trabajos.',
    'Debe mantener la atención durante las explicaciones y terminar las tareas a tiempo.',
    'Le ayudará organizar mejor su material y traer las tareas hechas.',
    'Es importante que respete el turno de palabra y las normas de clase.',
  ],
  familia: [
    'En casa es muy recomendable leer juntos un ratito cada día.',
    'Les animamos a repasar con {nombre} lo trabajado en clase y a revisar la agenda.',
    'Practicar juegos de cálculo y problemas de la vida cotidiana le será de gran ayuda.',
    'Es importante mantener rutinas de descanso y de trabajo en casa.',
    'Gracias por su colaboración: seguimos trabajando juntos.',
  ],
};

export const fillComment = (tpl, nombre) => String(tpl).replace(/\{nombre\}/g, nombre || 'Su hijo o hija');

/** Texto breve según la nota de un área (para el informe, opcional). */
export function areaPhrase(nota) {
  const l = toLevel(nota);
  return l ? {
    IN: 'Necesita mejorar', SU: 'Progresa adecuadamente con ayuda', BI: 'Progresa adecuadamente',
    NT: 'Progresa muy bien', SB: 'Progresa de forma excelente',
  }[l] : '';
}

// ---------- Rúbrica por criterio (niveles de logro) ----------
/**
 * Descriptores por defecto de los cinco niveles para un criterio. Son genéricos y editables:
 * el criterio oficial se muestra arriba y cada nivel dice CÓMO lo consigue el alumno.
 */
export const DEFAULT_CRIT_RUBRIC = {
  IN: 'Todavía no lo consigue, ni siquiera con ayuda.',
  SU: 'Lo consigue con ayuda y de forma parcial.',
  BI: 'Lo consigue con alguna ayuda puntual.',
  NT: 'Lo consigue de forma autónoma.',
  SB: 'Lo consigue de forma autónoma, con precisión, y lo aplica a situaciones nuevas.',
};

/** Rúbrica efectiva de un criterio (la personalizada si existe, completada con la de serie). */
export const critRubric = (criterio) => ({ ...DEFAULT_CRIT_RUBRIC, ...(criterio?.rubrica || {}) });

export { LEVELS, LEVEL_LABELS };
