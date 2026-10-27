// Tabula · motor de evaluación (lógica pura, sin DOM ni almacenamiento).
// Todas las notas se guardan internamente en escala 0–10. La escala de niveles es solo
// una forma de introducir y mostrar notas.
//
// COLECCIONES (vía store.js)
// gradebooks  { id, groupId, area, cursoEscolar,
//               escala: 'niveles' | 'numerica',
//               modo: 'porcentajes' | 'criterios',
//               final: 'continua' | 'media',          // nota final: todas las actividades del curso | media de evaluaciones
//               instrumentos: [{ id, nombre, peso }],  // modo porcentajes (peso en %)
//               criterios:    [{ id, codigo, descripcion, peso }], // modo criterios (peso relativo, por defecto 1)
//               niveles: { IN, SU, BI, NT, SB },        // valor 0–10 que se guarda al poner un nivel
//               ajustes: { [ev]: { [studentId]: number } } }  // nota ajustada a mano por el docente (ev: '1','2','3','final')
// activities  { id, gradebookId, nombre, fecha:'YYYY-MM-DD', evaluacion: 1|2|3,
//               tipo: 'nota' | 'rubrica',
//               instrumentoId: string|null, criterioIds: string[], peso: number (por defecto 1),
//               rubrica?: { niveles: number (p. ej. 4), aspectos: [{ id, nombre, peso }] } }
// grades      { id, activityId, notas: { [studentId]: { v?: number|null, r?: (number|null)[], c?: string } } }
//               Un documento por actividad (una "columna" del cuaderno).
//               v = nota 0–10 (tipo 'nota'); r = nivel elegido en cada aspecto de la rúbrica (1..niveles); c = comentario.

export const LEVELS = ['IN', 'SU', 'BI', 'NT', 'SB'];
export const LEVEL_LABELS = { IN: 'Insuficiente', SU: 'Suficiente', BI: 'Bien', NT: 'Notable', SB: 'Sobresaliente' };
export const DEFAULT_LEVEL_VALUES = { IN: 3, SU: 5, BI: 6, NT: 7.5, SB: 9.5 };

export const DEFAULT_INSTRUMENTS = [
  { nombre: 'Pruebas escritas', peso: 30 },
  { nombre: 'Observación', peso: 20 },
  { nombre: 'Cuaderno', peso: 20 },
  { nombre: 'Trabajos y rúbricas', peso: 20 },
  { nombre: 'Lectura', peso: 10 },
];

export const EVALUACIONES = [
  { id: '1', label: '1.ª evaluación' },
  { id: '2', label: '2.ª evaluación' },
  { id: '3', label: '3.ª evaluación' },
  { id: 'final', label: 'Final' },
];

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp10 = (x) => Math.min(10, Math.max(0, x));

/** Media ponderada de [{v, w}] ignorando valores nulos y pesos no positivos. null si no hay datos. */
export function wmean(pairs) {
  let s = 0; let w = 0;
  for (const { v, w: wi } of pairs) {
    const ww = isNum(wi) ? wi : 1;
    if (isNum(v) && ww > 0) { s += v * ww; w += ww; }
  }
  return w > 0 ? s / w : null;
}

/** Nota numérica → nivel (IN <5, SU <6, BI <7, NT <9, SB ≥9). */
export function toLevel(n) {
  if (!isNum(n)) return null;
  if (n < 5) return 'IN';
  if (n < 6) return 'SU';
  if (n < 7) return 'BI';
  if (n < 9) return 'NT';
  return 'SB';
}

/** Valor 0–10 que se guarda al elegir un nivel. */
export const levelValue = (code, gb) => ((gb && gb.niveles) || DEFAULT_LEVEL_VALUES)[code] ?? null;

/** Redondeo a 1 decimal evitando errores de coma flotante. */
export const round1 = (n) => (isNum(n) ? Math.round((n + Number.EPSILON) * 10) / 10 : null);

/** Texto para mostrar: "7,5" o "NT". */
export function formatGrade(n, escala = 'numerica') {
  if (!isNum(n)) return '';
  if (escala === 'niveles') return toLevel(n);
  return String(round1(n)).replace('.', ',');
}

/** Convierte lo que escribe el docente ("7,5", "nt", "sb", "10") a 0–10. undefined = entrada no válida; null = borrar. */
export function parseGradeInput(text, gb) {
  const t = String(text ?? '').trim().toUpperCase();
  if (t === '') return null;
  if (LEVELS.includes(t)) return levelValue(t, gb);
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 10) return undefined;
  return n;
}

/** Nota 0–10 de un alumno en una actividad, o null si no está evaluado. */
export function entryScore(activity, entry) {
  if (!entry) return null;
  if (activity.tipo === 'rubrica') {
    const rub = activity.rubrica;
    if (!rub || !Array.isArray(entry.r) || !rub.aspectos?.length) return null;
    const N = rub.niveles || 4;
    const pairs = rub.aspectos.map((a, i) => {
      const lvl = entry.r[i];
      return { v: isNum(lvl) ? clamp10((lvl / N) * 10) : null, w: isNum(a.peso) ? a.peso : 1 };
    });
    return wmean(pairs);
  }
  return isNum(entry.v) ? clamp10(entry.v) : null;
}

/** Número de competencia específica a partir del código del criterio: "1.2" → "1", "CE2.3" → "2", "LCL.3.1" → "3". */
export function competenciaOf(codigo) {
  const nums = String(codigo || '').match(/\d+/g);
  return nums && nums.length >= 2 ? nums[nums.length - 2] : (nums ? nums[0] : null);
}

/**
 * Calcula las notas de un alumno.
 * @param gb          cuaderno (gradebook)
 * @param activities  actividades del cuaderno
 * @param gradesByAct { [activityId]: gradesDoc }
 * @param studentId
 * @param ev          '1' | '2' | '3' | 'final'
 * @returns { calc, nota, ajustada, porInstrumento, porCriterio, porCompetencia, porActividad, evaluadas }
 *   calc = nota calculada; nota = ajuste manual si existe, si no calc.
 */
export function computeStudent(gb, activities, gradesByAct, studentId, ev = 'final') {
  // Final como media de evaluaciones
  if (ev === 'final' && gb.final === 'media') {
    const parts = ['1', '2', '3'].map((e) => computeStudent(gb, activities, gradesByAct, studentId, e));
    const calc = wmean(parts.map((p) => ({ v: p.nota, w: 1 })));
    const merged = computeStudent({ ...gb, final: 'continua' }, activities, gradesByAct, studentId, 'final');
    return withOverride(gb, studentId, ev, { ...merged, calc, porEvaluacion: parts.map((p) => p.nota) });
  }

  const scope = activities.filter((a) => ev === 'final' || String(a.evaluacion) === String(ev));
  const porActividad = {};
  for (const a of scope) porActividad[a.id] = entryScore(a, gradesByAct[a.id]?.notas?.[studentId]);
  const evaluadas = Object.values(porActividad).filter(isNum).length;

  const porInstrumento = {};
  for (const ins of gb.instrumentos || []) {
    porInstrumento[ins.id] = wmean(scope.filter((a) => a.instrumentoId === ins.id)
      .map((a) => ({ v: porActividad[a.id], w: a.peso ?? 1 })));
  }

  const porCriterio = {};
  for (const cr of gb.criterios || []) {
    porCriterio[cr.id] = wmean(scope.filter((a) => (a.criterioIds || []).includes(cr.id))
      .map((a) => ({ v: porActividad[a.id], w: a.peso ?? 1 })));
  }

  const porCompetencia = {};
  const byCe = {};
  for (const cr of gb.criterios || []) {
    const ce = competenciaOf(cr.codigo);
    if (!ce) continue;
    (byCe[ce] ||= []).push({ v: porCriterio[cr.id], w: cr.peso ?? 1 });
  }
  for (const [ce, pairs] of Object.entries(byCe)) porCompetencia[ce] = wmean(pairs);

  let calc;
  if (gb.modo === 'criterios') {
    calc = wmean((gb.criterios || []).map((cr) => ({ v: porCriterio[cr.id], w: cr.peso ?? 1 })));
  } else {
    calc = wmean((gb.instrumentos || []).map((ins) => ({ v: porInstrumento[ins.id], w: ins.peso })));
  }

  return withOverride(gb, studentId, ev, { calc, porInstrumento, porCriterio, porCompetencia, porActividad, evaluadas });
}

function withOverride(gb, studentId, ev, r) {
  const adj = gb.ajustes?.[ev]?.[studentId];
  const ajustada = isNum(adj);
  return { ...r, nota: ajustada ? adj : r.calc, ajustada };
}

/** Notas de todo el grupo: { [studentId]: resultado de computeStudent }. */
export function computeGroup(gb, activities, gradesByAct, studentIds, ev = 'final') {
  const out = {};
  for (const id of studentIds) out[id] = computeStudent(gb, activities, gradesByAct, id, ev);
  return out;
}

/** Media de una actividad en el grupo (para la cabecera de columna). */
export function activityMean(activity, gradesDoc, studentIds) {
  return wmean(studentIds.map((id) => ({ v: entryScore(activity, gradesDoc?.notas?.[id]), w: 1 })));
}

/** Avisos de configuración para mostrar al docente. */
export function configWarnings(gb, activities = []) {
  const w = [];
  if (gb.modo === 'porcentajes') {
    const total = (gb.instrumentos || []).reduce((s, i) => s + (Number(i.peso) || 0), 0);
    if (Math.round(total) !== 100) w.push(`Los porcentajes de los instrumentos suman ${round1(total)} % en lugar de 100 %.`);
    const sin = activities.filter((a) => !a.instrumentoId || !(gb.instrumentos || []).some((i) => i.id === a.instrumentoId));
    if (sin.length) w.push(`${sin.length} actividad${sin.length > 1 ? 'es no tienen' : ' no tiene'} instrumento y no cuenta${sin.length > 1 ? 'n' : ''} para la nota.`);
  } else {
    if (!(gb.criterios || []).length) w.push('Añade los criterios de evaluación del área para poder calcular la nota.');
    const sin = activities.filter((a) => !(a.criterioIds || []).length);
    if (sin.length) w.push(`${sin.length} actividad${sin.length > 1 ? 'es no están vinculadas' : ' no está vinculada'} a ningún criterio y no cuenta${sin.length > 1 ? 'n' : ''} para la nota.`);
  }
  return w;
}

/** Interpreta criterios pegados (una línea por criterio): "1.1. Descripción", "CE1.2 - Descripción", "LCL.1.3 Descripción". */
export function parseCriteriaList(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^((?:[A-Za-zÁÉÍÓÚÑ]{1,5}\.?\s?)?\d+(?:\.\d+)+(?:\.[a-f](?=[.\s)]|$))?)\.?\s*[-–:)]?\s*(.*)$/);
    return m ? { codigo: m[1].replace(/\s/g, ''), descripcion: m[2].trim() } : { codigo: '', descripcion: line };
  });
}

/** Cuaderno nuevo con la configuración por defecto (los ids los pone quien llama). */
export function newGradebookConfig({ escala = 'numerica', modo = 'porcentajes', final = 'continua' } = {}, makeId = () => Math.random().toString(36).slice(2, 10)) {
  return {
    escala, modo, final,
    instrumentos: DEFAULT_INSTRUMENTS.map((i) => ({ id: makeId(), ...i })),
    criterios: [],
    niveles: { ...DEFAULT_LEVEL_VALUES },
    ajustes: {},
  };
}
