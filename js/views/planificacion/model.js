// Tabula · Planificación · datos y operaciones compartidas (vista y hoja de sesión).
// Toda la lógica de reparto vive en js/planning.js; aquí solo se leen datos, se aplican los
// cambios que devuelve el motor y se prepara el "Deshacer".
import { store } from '../../store.js';
import { todayISO, relativeDay, fromISO, MESES, DIAS, h } from '../../ui.js';
import { currentSchoolYear } from '../../school.js';
import {
  slotsFor, sortSessions, placeSessions, postponeFrom, reflowFrom, hasSlots,
} from '../../planning.js';

export { hasSlots };

export const ESTADOS_SIT = { borrador: 'Borrador', en_curso: 'En curso', terminada: 'Terminada' };
export const ESTADO_SIT_CLASS = { borrador: 't5', en_curso: 't2', terminada: 't3' };
export const ESTADOS_SES = { pendiente: 'Pendiente', hecha: 'Hecha', no_realizada: 'No realizada' };
export const ESTADO_SES_CLASS = { pendiente: 't5', hecha: 't3', no_realizada: 't1' };

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const shortDate = (iso) => { if (!iso) return ''; const d = fromISO(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };

/** Evaluación en curso según el mes (sep–dic: 1.ª, ene–mar: 2.ª, abr–ago: 3.ª). */
export function currentEvaluacion(d = new Date()) {
  const m = d.getMonth();
  return m >= 8 ? 1 : m <= 2 ? 2 : 3;
}

// ---------- Lectura de datos ----------
export const ctxFor = (groupId, area) => ({
  schedule: store.list('schedule'), events: store.list('events'), groupId, area,
});
export const situacionesOf = (groupId, area) =>
  store.list('situaciones').filter((s) => s.groupId === groupId && s.area === area)
    .sort((a, b) => (a.evaluacion || 1) - (b.evaluacion || 1) || (a.orden ?? 0) - (b.orden ?? 0));
export const sesionesOf = (groupId, area) =>
  store.list('sesiones').filter((s) => s.groupId === groupId && s.area === area);
export const sesionesOfSit = (situacionId) =>
  store.list('sesiones').filter((s) => s.situacionId === situacionId).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

/** Áreas de un grupo que ya tienen alguna situación. */
export const areasWithSituaciones = (groupId) =>
  [...new Set(store.list('situaciones').filter((s) => s.groupId === groupId).map((s) => s.area))];

/** Cuaderno de evaluación del grupo y área (el del curso actual si hay varios). */
export function gradebookOf(groupId, area) {
  const all = store.list('gradebooks').filter((g) => g.groupId === groupId && g.area === area);
  const year = store.get('groups', groupId)?.cursoEscolar || currentSchoolYear();
  return all.find((g) => g.cursoEscolar === year) || all[0] || null;
}

// ---------- Presentación de fechas y franjas ----------
export const slotOf = (schedule, id) => schedule.find((x) => x.id === id) || null;
export const slotTime = (slot) => (slot ? (slot.fin ? `${slot.inicio}–${slot.fin}` : slot.inicio) : '');

/** "Hoy · lun 26 oct · 09:00" (o "Sin fecha"). */
export function whenText(s, schedule, { long = false } = {}) {
  if (!s.fecha) return 'Sin fecha';
  const d = fromISO(s.fecha);
  const rel = relativeDay(s.fecha);
  const dia = long ? DIAS[d.getDay()] : DIAS[d.getDay()].slice(0, 3);
  const mes = long ? MESES[d.getMonth()] : MESES[d.getMonth()].slice(0, 3);
  const base = `${dia} ${d.getDate()} ${long ? 'de ' : ''}${mes}`;
  const rel2 = ['Hoy', 'Mañana', 'Ayer'].includes(rel) ? `${rel} · ` : '';
  const hora = slotTime(slotOf(schedule, s.scheduleId));
  return `${rel2}${base}${hora ? ` · ${hora}` : ''}`;
}

// ---------- Aplicar cambios con "Deshacer" ----------
const KEYS = ['fecha', 'scheduleId', 'estado', 'fija'];

/**
 * Aplica una lista de cambios del motor [{id, fecha, scheduleId}] (más un parche opcional por id)
 * y devuelve una función que restaura fecha, franja, estado y fijación de todas las sesiones tocadas.
 */
export function applyChanges(changes, patches = {}) {
  const ids = [...new Set([...changes.map((c) => c.id), ...Object.keys(patches)])];
  const before = ids.map((id) => store.get('sesiones', id)).filter(Boolean)
    .map((s) => Object.fromEntries([['id', s.id], ...KEYS.map((k) => [k, s[k] ?? null])]));
  for (const c of changes) store.update('sesiones', c.id, { fecha: c.fecha, scheduleId: c.scheduleId, ...(patches[c.id] || {}) });
  for (const [id, p] of Object.entries(patches)) if (!changes.some((c) => c.id === id)) store.update('sesiones', id, p);
  return () => before.forEach(({ id, ...rest }) => { if (store.get('sesiones', id)) store.update('sesiones', id, rest); });
}

/**
 * Aplaza una sesión: ella y las pendientes posteriores avanzan al siguiente hueco libre.
 * Si la sesión ya estaba vencida (fecha pasada), se recolocan desde hoy para no caer en el pasado.
 * @returns { changes, undo }
 */
export function postponeSession(sessionId) {
  const target = store.get('sesiones', sessionId);
  if (!target || !target.fecha) return { changes: [], undo: () => {} };
  const all = sesionesOf(target.groupId, target.area);
  const sits = situacionesOf(target.groupId, target.area);
  const ctx = ctxFor(target.groupId, target.area);
  let changes;
  if (target.fecha < todayISO()) {
    const later = sortSessions(all.filter((s) => s.id !== target.id && s.estado === 'pendiente' && !s.fija && s.fecha && s.fecha >= target.fecha), sits);
    changes = placeSessions(all, [target, ...later], ctx, todayISO());
  } else {
    // El motor solo reparte pendientes: si estaba "no realizada" la tratamos como pendiente
    const view = all.map((s) => (s.id === target.id ? { ...s, estado: 'pendiente', fija: false } : s));
    changes = postponeFrom(sessionId, view, ctx, sits);
  }
  const patches = { [sessionId]: { estado: 'pendiente', fija: false } };
  return { changes, undo: applyChanges(changes, patches) };
}

/**
 * Fija la fecha (y franja) de una sesión. Si otra sesión movible ocupaba esa franja,
 * se aplaza con el motor para que no coincidan.
 * @returns { moved: número de sesiones reajustadas además de la propia, undo }
 */
export function fixSessionDate(sessionId, fecha, scheduleId) {
  const s = store.get('sesiones', sessionId);
  const all = sesionesOf(s.groupId, s.area);
  const sits = situacionesOf(s.groupId, s.area);
  const ctx = ctxFor(s.groupId, s.area);
  const sim = all.map((x) => (x.id === s.id ? { ...x, fecha, scheduleId: scheduleId || null, fija: true } : x));
  const extra = [];
  if (scheduleId) {
    const clash = sim.filter((x) => x.id !== s.id && x.fecha === fecha && x.scheduleId === scheduleId && x.estado === 'pendiente' && !x.fija);
    for (const c of clash) {
      const ch = postponeFrom(c.id, sim, ctx, sits);
      ch.forEach((x) => { const i = sim.findIndex((y) => y.id === x.id); if (i >= 0) sim[i] = { ...sim[i], ...x }; extra.push(x); });
    }
  }
  const merged = [...new Map(extra.map((c) => [c.id, c])).values()].filter((c) => c.id !== s.id);
  const undo = applyChanges([{ id: s.id, fecha, scheduleId: scheduleId || null }, ...merged], { [s.id]: { fija: true } });
  return { moved: merged.length, undo };
}

/** Recoloca en el orden actual las sesiones pendientes y no fijas de una situación. */
export function replaceInOrder(situacionId) {
  const own = sesionesOfSit(situacionId);
  const first = own[0];
  if (!first) return { changes: [], undo: () => {} };
  const all = sesionesOf(first.groupId, first.area);
  const ctx = ctxFor(first.groupId, first.area);
  const movable = own.filter((s) => s.estado === 'pendiente' && !s.fija);
  const dates = movable.map((s) => s.fecha).filter(Boolean).sort();
  const from = dates[0] || todayISO();
  const changes = placeSessions(all, movable, ctx, from);
  return { changes, undo: applyChanges(changes) };
}

/** Intercambia el orden de dos elementos (sesiones o situaciones) de una colección. */
export function swapOrden(col, a, b) {
  store.update(col, a.id, { orden: b.orden ?? 0 });
  store.update(col, b.id, { orden: a.orden ?? 0 });
}

/** Normaliza `orden` a 0,1,2… dentro de una lista ya ordenada (por si hay valores repetidos). */
export function normalizeOrden(col, list) {
  list.forEach((x, i) => { if (x.orden !== i) store.update(col, x.id, { orden: i }); });
}

/** Sesión nueva con todos los campos del modelo. */
export function addSession(sit, orden, titulo) {
  return store.add('sesiones', {
    situacionId: sit.id, groupId: sit.groupId, area: sit.area, orden, titulo,
    objetivo: '', desarrollo: '', materiales: '', fecha: null, scheduleId: null, fija: false, estado: 'pendiente', diario: '',
  });
}

// ---------- Utilidades de interfaz ----------
/** Atajo para enlaces de la vista. */
export function href({ grupo, area, sit } = {}) {
  const p = new URLSearchParams();
  if (grupo) p.set('grupo', grupo);
  if (area) p.set('area', area);
  if (sit) p.set('sit', sit);
  return `#/planificacion?${p}`;
}

/** Ejecuta fn tras una pausa sin escribir; flush() la ejecuta ya. */
export function debounced(fn, ms = 400) {
  let t = null;
  const run = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  run.flush = (...a) => { if (t) { clearTimeout(t); t = null; fn(...a); } };
  return run;
}

/** Campo etiquetado. */
export function field(label, control, hint) {
  const id = control.id || (control.id = 'pl' + Math.random().toString(36).slice(2, 8));
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('span', { class: 'pl-hint' }, hint) : null);
}

/** Control segmentado accesible. */
export function segmented(options, value, onChange, label) {
  const wrap = h('div', { class: 'segmented pl-seg', role: 'group', 'aria-label': label || null });
  const paint = (v) => wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === v)));
  options.forEach(([v, text]) => wrap.append(h('button', {
    type: 'button', dataset: { v: String(v) }, 'aria-selected': String(String(v) === String(value)),
    onclick: () => { paint(String(v)); onChange(v); },
  }, text)));
  return wrap;
}

/** Iconos propios (ui.js no los trae): pin, flecha arriba. SVG estático, sin texto del usuario. */
const SVG = {
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.01"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
export function ico(name, size = 18) {
  return h('span', {
    class: 'pl-ico', 'aria-hidden': 'true',
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SVG[name] || ''}</svg>`,
  });
}

export { slotsFor, reflowFrom };
