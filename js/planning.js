// Tabula · motor de planificación (lógica pura, sin DOM ni almacenamiento).
// Reparte las sesiones de una situación de aprendizaje en los huecos del horario del grupo y área,
// saltando fines de semana y días no lectivos, y las reajusta cuando una sesión no se puede dar.
//
// COLECCIONES (vía store.js)
// situaciones { id, groupId, area, titulo, evaluacion: 1|2|3, descripcion, productoFinal,
//               criterioIds: string[] (ids de criterios del cuaderno de ese grupo y área),
//               orden: number, estado: 'borrador' | 'en_curso' | 'terminada' }
// sesiones    { id, situacionId, groupId, area, orden: number (dentro de su situación),
//               titulo, objetivo, desarrollo, materiales,
//               fecha: 'YYYY-MM-DD' | null, scheduleId: string | null (franja del horario),
//               fija: boolean (fecha elegida a mano: el reajuste automático no la mueve),
//               estado: 'pendiente' | 'hecha' | 'no_realizada', diario: '' (qué pasó realmente) }

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const weekday = (iso) => fromISO(iso).getDay(); // 0 domingo … 6 sábado

/**
 * Huecos del horario de un grupo y área, ordenados por día y hora.
 * Las franjas seguidas del mismo día (fin de una = inicio de la siguiente) se unen en un solo
 * bloque: 12:30–13:00 + 13:00–13:30 + 13:30–14:00 de Matemáticas es UNA sesión de 12:30 a 14:00.
 * El bloque conserva el id de su primera franja (es el `scheduleId` de las sesiones planificadas).
 */
export function slotsFor(schedule, groupId, area) {
  const raw = schedule
    .filter((s) => s.tipo === 'clase' && s.groupId === groupId && s.area === area)
    .sort((a, b) => a.dia - b.dia || a.inicio.localeCompare(b.inicio));
  const out = [];
  for (const s of raw) {
    const last = out[out.length - 1];
    if (last && last.dia === s.dia && last.fin && last.fin === s.inicio) {
      last.fin = s.fin; last.ids.push(s.id);
    } else out.push({ ...s, ids: [s.id] });
  }
  return out;
}

/** Bloque (unión de franjas seguidas) al que pertenece una franja del horario. */
export function blockOf(schedule, scheduleId) {
  const s = schedule.find((x) => x.id === scheduleId);
  if (!s || s.tipo !== 'clase') return s || null;
  return slotsFor(schedule, s.groupId, s.area).find((b) => b.ids.includes(scheduleId)) || null;
}

/** ¿Es lectivo el día? (lunes a viernes y sin evento 'nolectivo' que lo cubra) */
export function isLectivo(iso, events = []) {
  const wd = weekday(iso);
  if (wd === 0 || wd === 6) return false;
  return !events.some((e) => e.tipo === 'nolectivo' && (e.fecha === iso || (e.fechaFin && e.fecha <= iso && iso <= e.fechaFin)));
}

const slotKey = (fecha, scheduleId) => `${fecha}|${scheduleId}`;

/**
 * Generador de huecos libres desde una fecha (incluida).
 * @param ctx { schedule, events, groupId, area }
 * @param occupied Set de claves "fecha|scheduleId" que no se pueden usar
 */
export function* freeSlots(ctx, fromIso, occupied = new Set(), maxDays = 400) {
  const slots = slotsFor(ctx.schedule, ctx.groupId, ctx.area);
  if (!slots.length) return;
  for (let i = 0; i < maxDays; i++) {
    const iso = addDays(fromIso, i);
    if (!isLectivo(iso, ctx.events)) continue;
    const wd = weekday(iso);
    for (const s of slots) {
      if (s.dia !== wd) continue;
      const k = slotKey(iso, s.id);
      if (!occupied.has(k)) yield { fecha: iso, scheduleId: s.id, inicio: s.inicio };
    }
  }
}

/** Orden natural de las sesiones: fecha (las sin fecha al final), situación, orden interno. */
export function sortSessions(sesiones, situaciones = []) {
  const sitOrder = new Map(situaciones.map((s) => [s.id, s.orden ?? 0]));
  return [...sesiones].sort((a, b) =>
    (a.fecha || '9999').localeCompare(b.fecha || '9999') ||
    (sitOrder.get(a.situacionId) ?? 0) - (sitOrder.get(b.situacionId) ?? 0) ||
    (a.orden ?? 0) - (b.orden ?? 0));
}

/**
 * Reparte sesiones en el horario.
 * Coloca, en orden, las sesiones "movibles" (pendientes, no fijas) indicadas en `toPlace`
 * en los huecos libres a partir de `fromIso`. Los huecos ocupados por el resto de sesiones del
 * mismo grupo y área (hechas, fijas o no incluidas) se respetan.
 * @param allSesiones todas las sesiones del grupo y área
 * @param toPlace sesiones a colocar, ya en el orden deseado
 * @param opts.skip claves "fecha|scheduleId" adicionales que no se deben usar (p. ej. la sesión perdida)
 * @returns [{ id, fecha, scheduleId }] — solo para las sesiones que cambian o reciben fecha;
 *          las que no caben (horario vacío) se devuelven con fecha null.
 */
export function placeSessions(allSesiones, toPlace, ctx, fromIso, { skip = [] } = {}) {
  const moving = new Set(toPlace.map((s) => s.id));
  const occupied = new Set(skip);
  for (const s of allSesiones) {
    if (!moving.has(s.id) && s.fecha && s.scheduleId && s.estado !== 'no_realizada') occupied.add(slotKey(s.fecha, s.scheduleId));
  }
  const gen = freeSlots(ctx, fromIso, occupied);
  const out = [];
  for (const s of toPlace) {
    const next = gen.next();
    const slot = next.done ? null : next.value;
    const fecha = slot ? slot.fecha : null;
    const scheduleId = slot ? slot.scheduleId : null;
    if (fecha !== s.fecha || scheduleId !== s.scheduleId) out.push({ id: s.id, fecha, scheduleId });
  }
  return out;
}

const isMovable = (s) => s.estado === 'pendiente' && !s.fija;

/**
 * Programa una situación de aprendizaje: coloca sus sesiones pendientes y sin fecha fija
 * a partir de `fromIso`, en su orden interno.
 */
export function scheduleSituacion(situacionId, allSesiones, ctx, fromIso) {
  const own = allSesiones.filter((s) => s.situacionId === situacionId && isMovable(s))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return placeSessions(allSesiones, own, ctx, fromIso);
}

/**
 * Una sesión no se ha podido dar (o se aplaza): ella y todas las pendientes posteriores
 * del mismo grupo y área avanzan al siguiente hueco libre. Las fijas y las hechas no se mueven.
 * @returns cambios [{ id, fecha, scheduleId }]
 */
export function postponeFrom(sessionId, allSesiones, ctx, situaciones = []) {
  const target = allSesiones.find((s) => s.id === sessionId);
  if (!target || !target.fecha) return [];
  const following = sortSessions(allSesiones.filter((s) => isMovable(s) && s.fecha && (
    s.id === sessionId || s.fecha > target.fecha || (s.fecha === target.fecha && slotStart(ctx, s) >= slotStart(ctx, target))
  )), situaciones);
  // La propia sesión va primero aunque compartiera fecha con otra anterior
  const ordered = [target, ...following.filter((s) => s.id !== sessionId)];
  return placeSessions(allSesiones, ordered, ctx, target.fecha, { skip: [slotKey(target.fecha, target.scheduleId)] });
}

function slotStart(ctx, s) {
  const slot = ctx.schedule.find((x) => x.id === s.scheduleId);
  return slot ? slot.inicio : '';
}

/**
 * Reajusta todo el grupo y área desde una fecha: recoloca en orden las sesiones movibles
 * con fecha >= fromIso. Útil tras añadir un día no lectivo o cambiar el horario.
 */
export function reflowFrom(fromIso, allSesiones, ctx, situaciones = []) {
  const movable = sortSessions(allSesiones.filter((s) => isMovable(s) && s.fecha && s.fecha >= fromIso), situaciones);
  return placeSessions(allSesiones, movable, ctx, fromIso);
}

/** Sesiones de una fecha concreta para un grupo/área (o todas si no se indica). */
export const sessionsOn = (iso, sesiones, { groupId, area } = {}) =>
  sesiones.filter((s) => s.fecha === iso && (!groupId || s.groupId === groupId) && (!area || s.area === area));

/** Progreso de una situación: { total, hechas, programadas, sinFecha, inicio, fin } */
export function situacionProgress(situacionId, sesiones) {
  const own = sesiones.filter((s) => s.situacionId === situacionId);
  const fechas = own.map((s) => s.fecha).filter(Boolean).sort();
  return {
    total: own.length,
    hechas: own.filter((s) => s.estado === 'hecha').length,
    programadas: own.filter((s) => s.fecha).length,
    sinFecha: own.filter((s) => !s.fecha).length,
    inicio: fechas[0] || null,
    fin: fechas[fechas.length - 1] || null,
  };
}

/** Sesiones con fecha pasada que siguen pendientes (para avisar al docente). */
export const overdueSessions = (sesiones, todayIso) =>
  sesiones.filter((s) => s.estado === 'pendiente' && s.fecha && s.fecha < todayIso);

/** ¿Tiene el grupo alguna franja de esta área en el horario? (si no, no se puede programar) */
export const hasSlots = (ctx) => slotsFor(ctx.schedule, ctx.groupId, ctx.area).length > 0;
