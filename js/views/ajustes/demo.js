// Tabula · Ajustes · datos de ejemplo (grupo «1º Demo»). Todo lo creado lleva demo: true y vive en su propio grupo.
import { store, SYNC_COLLECTIONS } from '../../store.js';
import { currentSchoolYear, toMin } from '../../school.js';
import { buildFranjas } from '../../timetable.js';
import { todayISO, addDaysISO } from '../../ui.js';
import { createGradebook, addOfficialCriteria, currentEv, saveEntry } from '../cuaderno/model.js';
import { addSession } from '../planificacion/model.js';
import { placeSessions } from '../../planning.js';
import { saveFile, deleteFile } from '../../files.js';

const NOMBRES = ['Aitana', 'Bruno', 'Carla', 'Darío', 'Elena', 'Fabio', 'Gala', 'Hugo', 'Inés', 'Jorge', 'Kira', 'Leo', 'Mara', 'Nico', 'Olivia', 'Pablo', 'Rocío', 'Samuel', 'Triana', 'Unai'];
const PLANTAS = ['Brisa', 'Cedro', 'Dehesa', 'Espiga', 'Fuente', 'Gaviota', 'Higuera', 'Jara', 'Lirio', 'Mirto', 'Nogal', 'Olivar', 'Palmar', 'Quejigo', 'Retama', 'Sauce', 'Tomillo', 'Umbría', 'Vega', 'Zarza'];
const L = 'Lengua Castellana y Literatura', M = 'Matemáticas', C = 'Conocimiento del Medio Natural, Social y Cultural',
  I = 'Lengua Extranjera (Inglés)', A = 'Educación Artística', F = 'Educación Física', V = 'Educación en Valores Cívicos y Éticos', T = 'Tutoría';
const SEMANA = [[L, M, C, I, A], [M, L, F, C, V], [L, M, I, F, C], [M, L, C, A, I], [L, M, C, T, F]];

export const hasDemo = () => store.list('groups').some((g) => g.demo);
const demoCount = () => ({ alumnos: store.list('students').filter((s) => s.demo).length });
export { demoCount };

const FICHA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cuenta y escribe</title><style>
@page{size:A4;margin:14mm}body{font:18pt/1.5 system-ui,sans-serif;color:#1c1b19}h1{font-family:Georgia,serif;font-weight:500}
.l{display:flex;gap:12mm;margin-bottom:8mm}.l span{flex:1;border-bottom:1.5px solid #333;padding-bottom:2mm}
.e{break-inside:avoid;border:1.5px solid #ccc;border-radius:10px;padding:8mm;margin:6mm 0}</style></head><body>
<div class="l"><span>Nombre:</span><span>Fecha:</span></div><h1>Cuenta y escribe</h1>
<div class="e"><b>1.</b> Rodea 10 manzanas: 🍎 🍎 🍎 🍎 🍎 🍎 🍎 🍎 🍎 🍎 🍎 🍎</div>
<div class="e"><b>2.</b> Completa: 5 + 3 = ____ &nbsp;&nbsp; 9 − 4 = ____</div>
<div class="e"><b>3.</b> Escribe el número que va antes y después: ___ 14 ___</div>
<div class="e"><b>4.</b> Dibuja la mitad de este círculo y píntala.</div></body></html>`;

/** Crea el grupo de ejemplo. Devuelve un resumen (o null si ya había datos de ejemplo). */
export async function loadDemo() {
  if (hasDemo()) return null;
  const d = { demo: true };
  const year = currentSchoolYear();
  const today = todayISO();
  const group = store.add('groups', { nombre: '1º Demo', curso: 1, cursoEscolar: year, color: 't5', tutoria: false, archivado: false, ...d });
  const gid = group.id;
  const students = NOMBRES.map((n, i) => store.add('students', { groupId: gid, nombre: n, apellidos: `Ejemplo ${PLANTAS[i]}`, orden: i, medidas: '', observaciones: '', contacto: '', ...d }));
  store.add('medidas', { groupId: gid, studentId: students[3].id, tipo: 'refuerzo', detalle: 'Ejemplo ficticio', areas: [], profesional: '', horario: '', inicio: today, revision: addDaysISO(today, 20), estado: 'activa', seguimiento: [], ...d });

  // Horario: solo franjas libres (si chocara con tu horario, no se crea)
  const existing = store.list('schedule').filter((s) => !s.demo);
  const free = (dia, ini, fin) => !existing.some((s) => s.dia === dia && toMin(s.inicio) < toMin(fin) && toMin(ini) < toMin(s.fin));
  const saved = store.getSetting('horarioFranjas', []) || [];
  const franjas = saved.length ? saved : buildFranjas();
  const clases = franjas.filter((f) => f.tipo === 'clase').slice(0, 5);
  let slots = 0;
  clases.forEach((f, i) => {
    for (let dia = 1; dia <= 5; dia++) {
      if (!free(dia, f.inicio, f.fin)) continue;
      store.add('schedule', { dia, inicio: f.inicio, fin: f.fin, tipo: 'clase', area: SEMANA[dia - 1][i], groupId: gid, titulo: '', aula: '', apoyo: '', ...d });
      slots++;
    }
  });
  if (slots) franjas.filter((f) => f.tipo === 'recreo').forEach((f) => {
    for (let dia = 1; dia <= 5; dia++) if (free(dia, f.inicio, f.fin) && !store.list('schedule').some((s) => s.dia === dia && s.inicio === f.inicio && s.fin === f.fin)) {
      store.add('schedule', { dia, inicio: f.inicio, fin: f.fin, tipo: 'recreo', area: '', groupId: null, titulo: 'Recreo', aula: '', apoyo: '', ...d });
    }
  });

  // Cuaderno de Matemáticas con criterios oficiales, actividades y notas
  const gb0 = createGradebook(gid, M, { escala: 'niveles', modo: 'criterios', final: 'continua' });
  store.update('gradebooks', gb0.id, d);
  await addOfficialCriteria(gb0.id);
  const gb = store.get('gradebooks', gb0.id);
  const crit = (gb.criterios || []);
  const ev = Number(currentEv());
  const instr = (gb.instrumentos || [])[0];
  const mk = (nombre, back, ci, base) => {
    const act = store.add('activities', { gradebookId: gb.id, nombre, fecha: addDaysISO(today, -back), evaluacion: ev, tipo: 'nota', instrumentoId: instr ? instr.id : null, criterioIds: crit.slice(ci, ci + 2).map((c) => c.id), peso: 1, ...d });
    students.forEach((s, i) => saveEntry(act.id, s.id, { v: Math.min(10, Math.max(2, base + ((i * 7 + back) % 6) - 2)) }));
    const doc = store.list('grades').find((g) => g.activityId === act.id);
    if (doc) store.update('grades', doc.id, d);
  };
  mk('Problemas de sumas', 14, 0, 7);
  mk('Control: números hasta el 20', 7, 1, 6.5);
  mk('Observación en clase', 2, 2, 7.5);

  // Situación de aprendizaje con 3 sesiones (programadas en el horario de ejemplo)
  const fichaDoc = await (async () => {
    const f = new File([FICHA], 'cuenta-y-escribe.html', { type: 'text/html' });
    const sv = await saveFile(f);
    return store.add('documentos', { titulo: 'Ficha: cuenta y escribe', fileId: sv.fileId, nombreArchivo: sv.nombre, tipo: 'text/html', tamano: sv.tamano, paginas: 1, miniatura: null, carpeta: '', etiquetas: ['Ejemplo'], notas: '', favorito: false, ...d });
  })();
  const sit = store.add('situaciones', { groupId: gid, area: M, titulo: 'Los números hasta el 20', evaluacion: ev, descripcion: 'Situación de ejemplo para ver cómo se reparten las sesiones por el horario.', productoFinal: '', criterioIds: crit.slice(0, 2).map((c) => c.id), orden: 0, estado: 'en_curso', ...d });
  const titulos = [['Contamos objetos', 'Contar hasta 20 con material manipulativo.', 'Garbanzos, cuentas, vasos'], ['Escribimos los números', 'Reconocer y escribir los números del 11 al 20.', 'Ficha «Cuenta y escribe»'], ['Mitades y dobles', 'Descubrir la mitad y el doble de una cantidad.', 'Regletas']];
  const ses = titulos.map(([t, o, m], i) => {
    const s = addSession(sit, i, t);
    return store.update('sesiones', s.id, { objetivo: o, desarrollo: 'Trabajo en gran grupo y después en parejas.', materiales: m, documentoIds: i === 1 ? [fichaDoc.id] : [], ...d });
  });
  if (slots) {
    const schedule = store.list('schedule');
    const out = placeSessions(store.list('sesiones').filter((s) => s.situacionId === sit.id), ses, { schedule, events: store.list('events'), groupId: gid, area: M }, today);
    out.forEach((u) => store.update('sesiones', u.id, { fecha: u.fecha, scheduleId: u.scheduleId }));
  }

  // Tareas, eventos y una reunión
  [['Preparar la ficha de mitades', 1], ['Llamar a una familia (ejemplo)', 2], ['Revisar el cuaderno de Matemáticas', 5]].forEach(([title, n]) =>
    store.add('tasks', { title, notes: '', due: addDaysISO(today, n), time: null, priority: 0, tags: [], subtasks: [], done: false, doneAt: null, ...d }));
  store.add('events', { titulo: 'Salida al parque (ejemplo)', fecha: addDaysISO(today, 9), fechaFin: null, hora: '10:00', tipo: 'excursion', groupId: gid, notas: '', ...d });
  store.add('events', { titulo: 'Evaluación inicial (ejemplo)', fecha: addDaysISO(today, 4), fechaFin: null, hora: null, tipo: 'evaluacion', groupId: gid, notas: '', ...d });
  const rd = addDaysISO(today, 3);
  const reu = store.add('reuniones', { groupId: gid, studentIds: [students[0].id], fecha: rd, hora: '16:00', tipo: 'familia', modalidad: 'presencial', iniciativa: 'tutor', asistentes: '', motivo: 'Reunión de ejemplo', resumen: '', acuerdos: [], estado: 'prevista', eventId: null, ...d });
  const rev = store.add('events', { titulo: `Tutoría · ${students[0].nombre}`, fecha: rd, fechaFin: null, hora: '16:00', tipo: 'tutoria', groupId: gid, notas: '', origen: 'tutoria', reunionId: reu.id, ...d });
  store.update('reuniones', reu.id, { eventId: rev.id });
  return { groupId: gid, alumnos: students.length, horario: slots > 0 };
}

const COLS_BY_GROUP = ['students', 'schedule', 'gradebooks', 'situaciones', 'sesiones', 'attendance', 'observaciones', 'reuniones', 'medidas', 'informes', 'impresiones', 'events', 'tasks', 'documentos'];

/**
 * Quita todo lo que sea de ejemplo. Devuelve { total, snapshot, commit } :
 * snapshot permite deshacer (restoreDemo); commit() borra los archivos (llamar cuando ya no se pueda deshacer).
 */
export function removeDemo() {
  const groupIds = new Set(store.list('groups').filter((g) => g.demo).map((g) => g.id));
  const students = new Set(store.list('students').filter((s) => s.demo || groupIds.has(s.groupId)).map((s) => s.id));
  const gbs = new Set(store.list('gradebooks').filter((g) => g.demo || groupIds.has(g.groupId)).map((g) => g.id));
  const acts = new Set(store.list('activities').filter((a) => a.demo || gbs.has(a.gradebookId)).map((a) => a.id));
  const docs = new Set(store.list('documentos').filter((x) => x.demo).map((x) => x.id));
  const mine = (col, it) => it.demo
    || (col === 'groups' && groupIds.has(it.id))
    || (it.groupId && groupIds.has(it.groupId))
    || (it.studentId && students.has(it.studentId))
    || (it.gradebookId && gbs.has(it.gradebookId))
    || (it.activityId && acts.has(it.activityId))
    || (col === 'impresiones' && docs.has(it.documentoId));
  const snapshot = {}; let total = 0;
  for (const col of SYNC_COLLECTIONS) {
    for (const it of store.list(col)) {
      if (!mine(col, it)) continue;
      const rm = store.remove(col, it.id);
      if (rm) { (snapshot[col] ||= []).push(rm); total++; }
    }
  }
  const settings = [...groupIds].flatMap((g) => [`sustituto:normas:${g}`, `aula:responsables:${g}`]).map((k) => [k, store.getSetting(k, null)]).filter(([, v]) => v !== null);
  groupIds.forEach((g) => { store.setSetting(`sustituto:normas:${g}`, null); store.setSetting(`aula:responsables:${g}`, null); });
  const fileIds = (snapshot.documentos || []).map((x) => x.fileId).filter(Boolean);
  return { total, snapshot, settings, commit: () => Promise.all(fileIds.map((f) => deleteFile(f).catch(() => {}))) };
}

export function restoreDemo({ snapshot, settings }) {
  for (const [col, items] of Object.entries(snapshot)) items.forEach((it) => store.restore(col, it));
  settings.forEach(([k, v]) => store.setSetting(k, v));
}
