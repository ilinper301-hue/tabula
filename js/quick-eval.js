// Tabula · evaluación rápida en clase.
// Cada nivel que se pone desde Hoy queda en el Cuaderno como una actividad de observación
// «Obs. 1.1.a · 27 oct», una por criterio y día, vinculada a ese criterio y al instrumento «Observación».
// Así cuenta para la nota igual que cualquier otra actividad, en los dos modos de cálculo.

import { store } from './store.js';
import { levelValue, toLevel } from './grading.js';
import { saveEntry, currentEv, findGradebook } from './views/cuaderno/model.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const fromISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

const isQuick = (a, gbId, criterioId, fecha) => a.gradebookId === gbId && a.origen === 'rapida'
  && a.fecha === fecha && (a.criterioIds || []).length === 1 && a.criterioIds[0] === criterioId;

/** Instrumento de observación del cuaderno (o el primero, o null). */
export function observationInstrument(gb) {
  const ins = gb?.instrumentos || [];
  return (ins.find((i) => /observ/i.test(i.nombre)) || ins[0] || null)?.id || null;
}

/** Actividad de observación de un criterio en un día (la crea si hace falta y crear = true). */
export function quickActivity(gbId, criterioId, fecha, { crear = true } = {}) {
  const found = store.list('activities').find((a) => isQuick(a, gbId, criterioId, fecha));
  if (found || !crear) return found || null;
  const gb = store.get('gradebooks', gbId);
  const cr = (gb?.criterios || []).find((c) => c.id === criterioId);
  if (!gb || !cr) return null;
  const d = fromISO(fecha);
  return store.add('activities', {
    gradebookId: gbId, nombre: `Obs. ${cr.codigo || 'criterio'} · ${d.getDate()} ${MESES[d.getMonth()]}`,
    fecha, evaluacion: Number(currentEv(d)), tipo: 'nota', instrumentoId: observationInstrument(gb),
    criterioIds: [criterioId], peso: 1, origen: 'rapida',
  });
}

/** Pone (o quita, con nivel null) el nivel de un alumno en un criterio para ese día. */
export function setQuickLevel(gbId, criterioId, studentId, nivel, fecha) {
  const gb = store.get('gradebooks', gbId);
  if (!gb) return;
  const act = nivel ? quickActivity(gbId, criterioId, fecha) : quickActivity(gbId, criterioId, fecha, { crear: false });
  if (!act) return;
  saveEntry(act.id, studentId, { v: nivel ? levelValue(nivel, gb) : null });
  // Si la actividad se queda vacía, se quita para no llenar el cuaderno de columnas en blanco
  if (!nivel) {
    const doc = store.list('grades').find((g) => g.activityId === act.id);
    if (!doc || !Object.keys(doc.notas || {}).length) {
      if (doc) store.remove('grades', doc.id);
      store.remove('activities', act.id);
    }
  }
}

/** Niveles puestos hoy: { [studentId]: 'NT' } */
export function quickLevels(gbId, criterioId, fecha) {
  const act = quickActivity(gbId, criterioId, fecha, { crear: false });
  if (!act) return {};
  const doc = store.list('grades').find((g) => g.activityId === act.id);
  const out = {};
  for (const [sid, e] of Object.entries(doc?.notas || {})) if (typeof e.v === 'number') out[sid] = toLevel(e.v);
  return out;
}

/** Último nivel registrado de cada alumno en un criterio (cualquier actividad con ese criterio; `before` = solo anteriores a esa fecha). */
export function lastLevels(gbId, criterioId, before = null) {
  const acts = store.list('activities').filter((a) => a.gradebookId === gbId && (a.criterioIds || []).includes(criterioId) && (!before || (a.fecha || '') < before))
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const grades = new Map(store.list('grades').map((g) => [g.activityId, g]));
  const out = {};
  for (const a of acts) {
    for (const [sid, e] of Object.entries(grades.get(a.id)?.notas || {})) {
      if (typeof e.v === 'number') out[sid] = { nivel: toLevel(e.v), fecha: a.fecha };
    }
  }
  return out;
}

/** Cuaderno del grupo y área (curso escolar del grupo). */
export const gradebookFor = (groupId, area) => findGradebook(groupId, area);
