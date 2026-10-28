// Tabula · Planificación · «Programación»: modelo de datos (lógica pura salvo la lectura inicial del almacén).
// Se calcula todo de una vez por pintado: bloques del horario, sesiones planificadas, eventos y recuentos.
import { store } from '../../store.js';
import { addDaysISO, fromISO, toISO, MESES } from '../../ui.js';
import { isLectivo } from '../../planning.js';
import { getGroups, AREAS } from '../../school.js';

export const isoDia = (iso) => ((fromISO(iso).getDay() + 6) % 7) + 1;       // 1 = lunes … 7 = domingo
export const mondayOf = (iso) => addDaysISO(iso, -(isoDia(iso) - 1));
export const weekDaysOf = (monday) => [0, 1, 2, 3, 4].map((i) => addDaysISO(monday, i));
export const validISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(fromISO(s).getTime());
export const firstOfMonth = (iso) => { const d = fromISO(iso); return toISO(new Date(d.getFullYear(), d.getMonth(), 1)); };
export const addMonths = (iso, n) => { const d = fromISO(iso); return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1)); };
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Estado «activo» de una sesión a efectos de planificación: la no realizada deja libre su hueco. */
export const isActive = (s) => s.estado !== 'no_realizada';

/** Grupos que aparecen en el horario del docente (clases con grupo). */
export function teacherGroups(schedule = store.list('schedule')) {
  const ids = new Set(schedule.filter((s) => s.tipo === 'clase' && s.groupId).map((s) => s.groupId));
  return getGroups().filter((g) => ids.has(g.id));
}

/** Lectura única del almacén para un pintado. */
export function readData() {
  const sesiones = store.list('sesiones');
  const byDate = new Map();
  for (const s of sesiones) if (s.fecha) { if (!byDate.has(s.fecha)) byDate.set(s.fecha, []); byDate.get(s.fecha).push(s); }
  return {
    schedule: store.list('schedule'),
    events: store.list('events'),
    situaciones: store.list('situaciones'),
    sesiones, byDate,
    groups: new Map(store.list('groups').map((g) => [g.id, g])),
  };
}

/**
 * Bloques del horario por día (1..5): franjas seguidas de la misma actividad unidas en una (como en Hoy).
 * El bloque conserva el id de su primera franja (el `scheduleId` de las sesiones planificadas).
 * Con groupId solo quedan las clases de ese grupo (recreos y otras actividades siempre).
 */
export function blocksByDay(schedule, groupId = '') {
  const out = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const rel = schedule.filter((s) => s.dia >= 1 && s.dia <= 5 && s.inicio && s.fin
    && (s.tipo !== 'clase' || !groupId || s.groupId === groupId))
    .sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio));
  for (const s of rel) {
    const list = out[s.dia];
    const last = list[list.length - 1];
    if (last && last.fin === s.inicio && last.tipo === s.tipo && (last.area || '') === (s.area || '')
      && (last.groupId || null) === (s.groupId || null) && (last.titulo || '') === (s.titulo || '')) {
      last.fin = s.fin; last.ids.push(s.id);
    } else list.push({ ...s, ids: [s.id], key: '' });
  }
  for (const list of Object.values(out)) list.forEach((b) => { b.key = `${b.inicio}|${b.fin}`; });
  return out;
}

const eventsOn = (events, iso) => events
  .filter((e) => e.fecha === iso || (e.fechaFin && e.fecha <= iso && iso <= e.fechaFin))
  .sort((a, b) => (a.hora || '').localeCompare(b.hora || '') || (a.titulo || '').localeCompare(b.titulo || '', 'es'));

/** Sesión planificada (principal y número de extras) para un bloque en una fecha. */
function planFor(data, iso, block) {
  if (block.tipo !== 'clase') return { plan: null, extra: 0 };
  const here = (data.byDate.get(iso) || []).filter((s) => block.ids.includes(s.scheduleId)
    && (!block.groupId || !s.groupId || s.groupId === block.groupId));
  const active = here.filter(isActive);
  const list = active.length ? active : here;
  list.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return { plan: list[0] || null, extra: Math.max(0, list.length - 1) };
}

/** Recuento de clases de una semana (o rango): { clases, planificadas, sinPlanificar, hechas }. */
const emptyStats = () => ({ clases: 0, planificadas: 0, sinPlanificar: 0, hechas: 0 });
function addStat(stats, plan) {
  stats.clases++;
  if (plan && isActive(plan)) { stats.planificadas++; if (plan.estado === 'hecha') stats.hechas++; } else stats.sinPlanificar++;
}

/**
 * Modelo de una semana.
 * @returns { monday, days:[{iso, dia, lectivo, events, nolec}], rows:[{key, inicio, fin, thin, cells:[items[]×5]}], stats, plannable }
 * item: { block, plan, extra, group }
 */
export function weekModel(data, monday, groupId = '') {
  const days = weekDaysOf(monday).map((iso, i) => {
    const events = eventsOn(data.events, iso).filter((e) => !e.groupId || !groupId || e.groupId === groupId);
    return { iso, dia: i + 1, lectivo: isLectivo(iso, data.events), events, nolec: events.filter((e) => e.tipo === 'nolectivo') };
  });
  const blocks = blocksByDay(data.schedule, groupId);
  const keys = new Map();
  for (const b of Object.values(blocks).flat()) if (!keys.has(b.key)) keys.set(b.key, { key: b.key, inicio: b.inicio, fin: b.fin });
  const rows = [...keys.values()].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.fin.localeCompare(b.fin))
    .map((r) => ({ ...r, cells: days.map(() => []), thin: false }));
  const rowOf = new Map(rows.map((r) => [r.key, r]));
  const stats = emptyStats();
  days.forEach((d, i) => {
    for (const b of blocks[d.dia]) {
      const { plan, extra } = planFor(data, d.iso, b);
      rowOf.get(b.key).cells[i].push({ block: b, plan, extra, group: data.groups.get(b.groupId) || null });
      if (b.tipo === 'clase' && d.lectivo) addStat(stats, plan);
    }
  });
  for (const r of rows) r.thin = !r.cells.some((c) => c.some((it) => it.block.tipo === 'clase'));
  return { monday, days, rows, stats };
}

/** Recuento de un rango de fechas (lunes a viernes) sin construir el modelo completo. */
export function rangeStats(data, fromIso, toIso, groupId = '') {
  const blocks = blocksByDay(data.schedule, groupId);
  const stats = emptyStats();
  for (let iso = fromIso; iso <= toIso; iso = addDaysISO(iso, 1)) {
    const dia = isoDia(iso);
    if (dia > 5 || !isLectivo(iso, data.events)) continue;
    for (const b of blocks[dia]) if (b.tipo === 'clase') addStat(stats, planFor(data, iso, b).plan);
  }
  return stats;
}

/** Colores de situación estables (chip tN) según su id. */
export const sitTone = (id) => {
  let n = 0;
  for (const ch of String(id)) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return `t${(n % 6) + 1}`;
};

/**
 * Modelo de un mes: filas = semanas, columnas = áreas con clase en el horario.
 * @returns { areas:[string], weeks:[{monday, days, events, cells:{[area]:{sits, total, hechas, slots, libres}}, libres}], stats }
 */
export function monthModel(data, firstIso, groupId = '', todayIso = '') {
  const d0 = fromISO(firstIso);
  const nDays = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  const lastIso = addDaysISO(firstIso, nDays - 1);
  const blocks = blocksByDay(data.schedule, groupId);
  const present = new Set(Object.values(blocks).flat().filter((b) => b.tipo === 'clase' && b.area).map((b) => b.area));
  const areas = [...present].sort((a, b) => {
    const ia = AREAS.indexOf(a), ib = AREAS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'es');
  });
  const sitById = new Map(data.situaciones.map((s) => [s.id, s]));
  const weeks = [];
  for (let mon = mondayOf(firstIso); mon <= lastIso; mon = addDaysISO(mon, 7)) {
    const days = weekDaysOf(mon);
    const cells = Object.fromEntries(areas.map((a) => [a, { sits: new Map(), total: 0, hechas: 0, slots: 0, libres: 0 }]));
    let libres = 0;
    const events = new Map();
    days.forEach((iso, i) => {
      for (const e of eventsOn(data.events, iso)) {
        if ((e.tipo === 'nolectivo' || e.tipo === 'evaluacion') && (!e.groupId || !groupId || e.groupId === groupId)) events.set(e.id, e);
      }
      const lect = isLectivo(iso, data.events);
      for (const s of data.byDate.get(iso) || []) {
        if (groupId && s.groupId !== groupId) continue;
        const c = cells[s.area];
        if (!c || !isActive(s)) continue;
        c.total++;
        if (s.estado === 'hecha') c.hechas++;
        const sit = sitById.get(s.situacionId);
        const key = s.situacionId || '';
        if (!c.sits.has(key)) c.sits.set(key, { sit, groupId: s.groupId, total: 0, hechas: 0 });
        const e = c.sits.get(key);
        e.total++; if (s.estado === 'hecha') e.hechas++;
      }
      if (!lect) return;
      for (const b of blocks[i + 1]) {
        if (b.tipo !== 'clase' || !cells[b.area]) continue;
        cells[b.area].slots++;
        const { plan } = planFor(data, iso, b);
        if (!plan || !isActive(plan)) { cells[b.area].libres++; libres++; }
      }
    });
    for (const c of Object.values(cells)) c.sits = [...c.sits.values()];
    weeks.push({ monday: mon, days, events: [...events.values()], cells, libres, current: !!todayIso && todayIso >= mon && todayIso <= addDaysISO(mon, 6) });
  }
  return { areas, weeks, stats: rangeStats(data, firstIso, lastIso, groupId), first: firstIso, last: lastIso };
}

// ---------- Textos ----------
const dm = (iso) => { const d = fromISO(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
/** "26 – 30 octubre 2026" / "26 oct – 1 nov 2026" */
export function weekLabel(monday) {
  const a = fromISO(monday), b = fromISO(addDaysISO(monday, 4));
  const y = b.getFullYear();
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${MESES[b.getMonth()]} ${y}`
    : `${dm(monday)} – ${dm(addDaysISO(monday, 4))} ${y}`;
}
export const monthLabel = (firstIso) => { const d = fromISO(firstIso); return `${cap(MESES[d.getMonth()])} ${d.getFullYear()}`; };
export const weekRange = (monday) => `${dm(monday)} – ${dm(addDaysISO(monday, 4))}`;
export { dm };

/** Enlace de la vista. */
export function progHref({ modo = 'semana', fecha, grupo } = {}) {
  const p = new URLSearchParams({ vista: 'programacion', modo });
  if (fecha) p.set('fecha', fecha);
  if (grupo) p.set('grupo', grupo);
  return `#/planificacion?${p}`;
}
