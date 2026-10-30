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

// ---------- Borrador del comentario (a partir de notas, observaciones y asistencia) ----------
const OBS_POS = {
  'Participa': 'participa activamente en clase', 'Ayuda a un compañero': 'ayuda a sus compañeros y compañeras',
  'Buen trabajo': 'realiza un buen trabajo', 'Esfuerzo': 'se esfuerza en sus tareas', 'Buena lectura': 'lee con soltura',
  'Comportamiento ejemplar': 'tiene un comportamiento ejemplar',
};
const OBS_NEG = {
  'No trae material': 'traer el material necesario', 'No hace la tarea': 'hacer las tareas a diario',
  'Interrumpe': 'respetar el turno de palabra', 'Distraído': 'mantener la atención en clase',
  'Conflicto con compañeros': 'mejorar la convivencia con sus compañeros y compañeras', 'Llega tarde': 'llegar con puntualidad',
};
/** Nombre del área para usar dentro de una frase. */
const AREA_PROSA = {
  'Lengua Castellana y Literatura': 'Lengua', 'Conocimiento del Medio Natural, Social y Cultural': 'Conocimiento del Medio',
  'Lengua Extranjera (Inglés)': 'Inglés', 'Religión / Atención educativa': 'Religión o Atención educativa',
  'Educación en Valores Cívicos y Éticos': 'Valores Cívicos y Éticos',
};
const listY = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`);
/** Etiquetas más repetidas (como mínimo `min` veces), de mayor a menor. */
function topTags(obs, tipo, map, min) {
  const n = new Map();
  for (const o of obs) if (o.tipo === tipo && map[o.etiqueta]) n.set(o.etiqueta, (n.get(o.etiqueta) || 0) + 1);
  return [...n].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1]).map(([k]) => map[k]);
}

/**
 * Primer borrador del comentario para la familia. Redacción neutra (sin marcar género) y prudente:
 * solo menciona lo que se repite en las observaciones. El docente lo revisa antes de guardarlo.
 * @param p { nombre, areas: [{ area, nota }], obs: [{ tipo, etiqueta }], asistencia?: { faltas, justificadas, retrasos }, final?: boolean }
 */
export function draftComment({ nombre, areas = [], obs = [], asistencia = null, final = false }) {
  const areaName = (a) => AREA_PROSA[a] || a;
  const periodo = final ? 'curso' : 'trimestre';
  const quien = nombre || 'Su hijo o hija';
  const notas = areas.filter((a) => typeof a.nota === 'number');
  const media = notas.length ? notas.reduce((t, a) => t + a.nota, 0) / notas.length : null;
  const out = [];
  if (media == null) out.push(`${quien} ha trabajado durante este periodo y seguimos de cerca su evolución.`);
  else if (media >= 8.5) out.push(`${quien} ha tenido un ${periodo} excelente.`);
  else if (media >= 7) out.push(`${quien} ha tenido un muy buen ${periodo}.`);
  else if (media >= 5) out.push(`${quien} ha tenido un ${periodo} positivo y progresa adecuadamente.`);
  else out.push(`${quien} ha encontrado algunas dificultades este ${periodo}, pero puede mejorar con esfuerzo y apoyo.`);

  const fuertes = notas.filter((a) => a.nota >= 7).sort((a, b) => b.nota - a.nota).slice(0, 2).map((a) => areaName(a.area));
  if (fuertes.length && media != null && media < 8.5) out.push(`Destaca especialmente en ${listY(fuertes)}.`);
  const pos = topTags(obs, 'positiva', OBS_POS, 2).slice(0, 2);
  if (pos.length) out.push(`En el día a día ${listY(pos)}.`);
  else if (obs.filter((o) => o.tipo === 'positiva').length >= 3) out.push('Muestra una actitud positiva en clase.');

  const flojas = notas.filter((a) => a.nota < 5).sort((a, b) => a.nota - b.nota).slice(0, 2).map((a) => areaName(a.area));
  if (flojas.length) out.push(`Debe reforzar ${listY(flojas)}.`);
  const neg = topTags(obs, 'negativa', OBS_NEG, 2).slice(0, 2);
  if (asistencia && asistencia.faltas >= 5) neg.push('mejorar la asistencia a clase');
  else if (asistencia && asistencia.retrasos >= 3 && !neg.includes(OBS_NEG['Llega tarde'])) neg.push(OBS_NEG['Llega tarde']);
  if (neg.length) out.push(`Le ayudará ${listY(neg.slice(0, 3))}.`);

  out.push(flojas.length || neg.length
    ? 'Les animamos a repasar en casa lo trabajado en clase. Gracias por su colaboración: seguimos trabajando juntos.'
    : 'Gracias por su colaboración: seguimos trabajando juntos.');
  return out.join(' ').slice(0, 1500);
}

// ---------- Sesión de evaluación (junta): resumen del grupo ----------
/**
 * Resumen para la sesión de evaluación.
 * @param students [{ id }]   areas [{ area, notas: { [studentId]: nota|null } }]
 * @returns { porArea: [{ area, media, evaluados, aprobados, pct }], porAlumno: { [id]: { media, suspensas: [area] } },
 *            reparto: { todo: n, una: n, dos: n, tresOmas: n, sinNotas: n }, mediaGrupo }
 */
export function juntaResumen(students, areas) {
  const isN = (n) => typeof n === 'number' && Number.isFinite(n);
  const porArea = areas.map(({ area, notas }) => {
    const v = students.map((s) => notas[s.id]).filter(isN);
    const aprobados = v.filter((n) => n >= 5).length;
    return { area, media: v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null, evaluados: v.length, aprobados, pct: v.length ? Math.round((aprobados / v.length) * 100) : null };
  });
  const porAlumno = {};
  const reparto = { todo: 0, una: 0, dos: 0, tresOmas: 0, sinNotas: 0 };
  for (const s of students) {
    const mine = areas.map((a) => ({ area: a.area, n: a.notas[s.id] })).filter((x) => isN(x.n));
    const suspensas = mine.filter((x) => x.n < 5).map((x) => x.area);
    porAlumno[s.id] = { media: mine.length ? round1(mine.reduce((t, x) => t + x.n, 0) / mine.length) : null, suspensas };
    if (!mine.length) reparto.sinNotas++;
    else if (!suspensas.length) reparto.todo++;
    else if (suspensas.length === 1) reparto.una++;
    else if (suspensas.length === 2) reparto.dos++;
    else reparto.tresOmas++;
  }
  const medias = Object.values(porAlumno).map((x) => x.media).filter(isN);
  return { porArea, porAlumno, reparto, mediaGrupo: medias.length ? round1(medias.reduce((a, b) => a + b, 0) / medias.length) : null };
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
