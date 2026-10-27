// Tabula · Cuaderno · acceso a datos (cuaderno, actividades, notas) y escritura de notas.
// Aquí NO hay cálculo de notas: todo cálculo viene de js/grading.js.
import { store, uid } from '../../store.js';
import { getStudents, currentSchoolYear } from '../../school.js';
import { computeGroup, newGradebookConfig } from '../../grading.js';

/** Trimestre actual: sept–dic → 1, ene–mar → 2, abr–ago → 3. */
export function currentEv(d = new Date()) {
  const m = d.getMonth();
  return m >= 8 ? '1' : m <= 2 ? '2' : '3';
}

/** Curso escolar de un grupo (si no consta, el actual). */
const yearOf = (groupId) => store.get('groups', groupId)?.cursoEscolar || currentSchoolYear();

export const findGradebook = (groupId, area) =>
  store.list('gradebooks').find((g) => g.groupId === groupId && g.area === area && g.cursoEscolar === yearOf(groupId)) || null;

const byDate = (a, b) => (a.fecha || '').localeCompare(b.fecha || '') || ((a.createdAt || 0) - (b.createdAt || 0));

/** Áreas con cuaderno para un grupo (curso actual). */
export const areasWithGradebook = (groupId) =>
  store.list('gradebooks').filter((g) => g.groupId === groupId && g.cursoEscolar === yearOf(groupId)).map((g) => g.area);

/**
 * Foto de todo lo necesario para pintar: cuaderno, alumnado, actividades, notas y resultados.
 * `gb` es null si todavía no existe el cuaderno de esa área.
 */
export function loadContext({ groupId, area, ev }) {
  const gb = findGradebook(groupId, area);
  const students = getStudents(groupId);
  if (!gb) return { gb: null, students, all: [], visible: [], gradesByAct: {}, results: {}, ev };
  const all = store.list('activities').filter((a) => a.gradebookId === gb.id).sort(byDate);
  const ids = new Set(all.map((a) => a.id));
  const gradesByAct = {};
  for (const g of store.list('grades')) if (ids.has(g.activityId) && !gradesByAct[g.activityId]) gradesByAct[g.activityId] = g;
  const visible = ev === 'final' ? all : all.filter((a) => String(a.evaluacion) === String(ev));
  const results = computeGroup(gb, all, gradesByAct, students.map((s) => s.id), ev);
  return { gb, students, all, visible, gradesByAct, results, ev };
}

/** Crea el cuaderno de un área con la configuración elegida. */
export function createGradebook(groupId, area, { escala, modo, final }) {
  return store.add('gradebooks', {
    groupId, area, cursoEscolar: yearOf(groupId),
    ...newGradebookConfig({ escala, modo, final }, uid),
  });
}

export const evaluacionDefaults = () =>
  ({ escala: 'numerica', modo: 'porcentajes', final: 'continua', ...(store.getSetting('evaluacionDefaults', null) || {}) });

/**
 * Guarda (parcialmente) la entrada de un alumno en una actividad. Se lee siempre el documento más reciente
 * para conservar las notas y comentarios de los demás alumnos. Una entrada vacía se elimina.
 */
export function saveEntry(activityId, studentId, patch) {
  const doc = store.list('grades').find((g) => g.activityId === activityId);
  const notas = { ...(doc?.notas || {}) };
  const entry = { ...(notas[studentId] || {}), ...patch };
  for (const k of Object.keys(entry)) if (entry[k] === null || entry[k] === undefined || entry[k] === '') delete entry[k];
  if (Array.isArray(entry.r) && entry.r.every((x) => x === null || x === undefined)) delete entry.r;
  if (Object.keys(entry).length) notas[studentId] = entry; else delete notas[studentId];
  if (doc) store.update('grades', doc.id, { notas });
  else if (Object.keys(notas).length) store.add('grades', { activityId, notas });
}

/** Ajuste manual de la nota (null = quitar). */
export function saveAdjustment(gb, ev, studentId, value) {
  const fresh = store.get('gradebooks', gb.id);
  if (!fresh) return;
  const ajustes = { ...(fresh.ajustes || {}) };
  const forEv = { ...(ajustes[ev] || {}) };
  if (value === null) delete forEv[studentId]; else forEv[studentId] = value;
  ajustes[ev] = forEv;
  store.update('gradebooks', gb.id, { ajustes });
}

/** Elimina una actividad y su documento de notas; devuelve lo borrado para poder deshacer. */
export function removeActivity(activityId) {
  const act = store.remove('activities', activityId);
  const gradeDocs = store.list('grades').filter((g) => g.activityId === activityId)
    .map((g) => store.remove('grades', g.id)).filter(Boolean);
  return { act, gradeDocs };
}
export function restoreActivity({ act, gradeDocs }) {
  if (act) store.restore('activities', act);
  gradeDocs.forEach((g) => store.restore('grades', g));
}

/** Elimina un cuaderno completo (actividades y notas incluidas). */
export function removeGradebook(gbId) {
  const gb = store.remove('gradebooks', gbId);
  const removed = store.list('activities').filter((a) => a.gradebookId === gbId).map((a) => removeActivity(a.id));
  return { gb, removed };
}
export function restoreGradebook({ gb, removed }) {
  if (gb) store.restore('gradebooks', gb);
  removed.forEach(restoreActivity);
}
