// Tabula · vista «Calendario»: semana, mes y editor del horario semanal.
// Datos: colecciones 'schedule' (horario), 'events' (eventos) y 'tasks' (solo lectura, para marcar vencimientos).
// Ajuste 'horarioFranjas': [{inicio, fin, tipo}] con la estructura de franjas del horario.
import { store } from '../store.js';
import { h, icon, todayISO, toISO, fromISO, addDaysISO, MESES, toast, openSheet } from '../ui.js';
import {
  AREAS, areaShort, areaColor, EVENT_TYPES, DIAS_LECTIVOS, getGroups, getGroup, sessionLabel, toMin,
} from '../school.js';
import { buildFranjas, applyFranjas, fillFranja } from '../timetable.js';
import { getPrograms } from '../programs.js';
import { calendarBanner } from './ajustes/calendario-escolar.js';
import { asistenteChip, asistenteDetail } from '../asistente-mark.js';

const VISTAS = [['semana', 'Semana'], ['mes', 'Mes'], ['horario', 'Horario']];
const HOUR_PX = 64;                                   // alto de una hora en la rejilla semanal
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_INI = ['L', 'M', 'X', 'J', 'V'];
const TIPOS_SESION = [['clase', 'Clase'], ['recreo', 'Recreo'], ['otro', 'Otro']];
const PHONE = '(max-width: 680px)';

// ---------- Utilidades ----------
const pad = (n) => String(n).padStart(2, '0');
const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const isoDia = (iso) => ((fromISO(iso).getDay() + 6) % 7) + 1;      // 1=lunes … 7=domingo
const mondayOf = (iso) => addDaysISO(iso, -(isoDia(iso) - 1));
const dayNum = (iso) => fromISO(iso).getDate();
const shortDate = (iso) => { const d = fromISO(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const validISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(fromISO(s));
const evColor = (ev) => (EVENT_TYPES[ev.tipo] || EVENT_TYPES.otro).color;
const isMultiDay = (ev) => !!ev.fechaFin && ev.fechaFin > ev.fecha;
/** Evento que va en la franja de arriba: sin hora o de varios días. */
const isAllDay = (ev) => !ev.hora || isMultiDay(ev);
const getFranjas = () => store.getSetting('horarioFranjas', []) || [];

let uidn = 0;
/** Campo de formulario con etiqueta asociada. */
function field(label, control, extra) {
  const id = `cal-f${++uidn}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, extra);
}
/** Interruptor (casilla con etiqueta). */
function toggle(label, checked, onchange) {
  const input = h('input', { type: 'checkbox', checked: !!checked, onchange });
  return { input, el: h('label', { class: 'cal-switch' }, input, h('span', {}, label)) };
}

// Hojas abiertas por esta vista: se cierran al salir de ella.
const openSheets = new Set();
function sheet(title, node) {
  let close;
  close = openSheet(title, node, { onClose: () => openSheets.delete(close) });
  openSheets.add(close);
  return close;
}

// Sesión que se abre en el editor al llegar al Horario desde «Editar en Horario».
let pendingEdit = null;

/** Instantánea de los datos para pintar una vez (evita copiar colecciones por cada celda). */
function snapshot() {
  const events = store.list('events');
  const sessions = store.list('schedule');
  const tasks = store.list('tasks').filter((t) => t.due && !t.done);
  return {
    sessions,
    eventsOn: (iso) => events
      .filter((e) => e.fecha === iso || (isMultiDay(e) && e.fecha <= iso && iso <= e.fechaFin))
      .sort((a, b) => (isAllDay(b) - isAllDay(a)) || (a.hora || '').localeCompare(b.hora || '') || a.titulo.localeCompare(b.titulo, 'es')),
    sessionsOn: (iso) => {
      const d = isoDia(iso);
      return d > 5 ? [] : sessions.filter((s) => s.dia === d).sort((a, b) => a.inicio.localeCompare(b.inicio));
    },
    tasksOn: (iso) => tasks.filter((t) => t.due === iso),
  };
}

/** Franjas del horario: las guardadas en el ajuste más las que deducimos de las sesiones. */
function allSlots(sessions) {
  const map = new Map();
  for (const f of getFranjas()) map.set(`${f.inicio}-${f.fin}`, { inicio: f.inicio, fin: f.fin, tipo: f.tipo || 'clase' });
  for (const s of sessions) {
    const k = `${s.inicio}-${s.fin}`;
    if (!map.has(k)) map.set(k, { inicio: s.inicio, fin: s.fin, tipo: s.tipo || 'clase' });
  }
  return [...map.values()].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.fin.localeCompare(b.fin));
}
const sessionAt = (sessions, dia, slot) => sessions.find((s) => s.dia === dia && s.inicio === slot.inicio && s.fin === slot.fin);

const groupName = (id) => { const g = getGroup(id); return g ? g.nombre : ''; };
const sessionSub = (s) => [`${s.inicio}–${s.fin}`, groupName(s.groupId), s.aula, s.apoyo ? `Apoyo: ${s.apoyo}` : ''].filter(Boolean).join(' · ');
const sessionTitle = (s) => (s.tipo === 'clase' ? (areaShort(s.area) || 'Clase') : sessionLabel(s));
const sessionTone = (s) => (s.tipo === 'clase' ? areaColor(s.area) : 'neutral');

function eventSub(ev) {
  const parts = [];
  if (isMultiDay(ev)) parts.push(`${shortDate(ev.fecha)} – ${shortDate(ev.fechaFin)}`);
  else if (ev.hora) parts.push(ev.hora);
  else parts.push('Todo el día');
  parts.push((EVENT_TYPES[ev.tipo] || EVENT_TYPES.otro).label);
  if (ev.groupId && groupName(ev.groupId)) parts.push(groupName(ev.groupId));
  return parts.join(' · ');
}

// =====================================================================
// Vista principal
// =====================================================================
export function render(container, params = new URLSearchParams()) {
  const vista = VISTAS.some(([k]) => k === params.get('vista')) ? params.get('vista') : 'semana';
  const fecha = validISO(params.get('fecha')) ? params.get('fecha') : todayISO();
  const mq = matchMedia(PHONE);

  let selDay = fecha;                                          // día elegido en el mes (móvil)
  const wd = isoDia(todayISO());
  let horDia = wd <= 5 ? wd : 1;                               // día elegido en el horario (móvil)

  /** Navega cambiando vista/fecha por el hash (el router vuelve a pintar). */
  const go = (patch = {}) => {
    const v = patch.vista ?? vista;
    const f = 'fecha' in patch ? patch.fecha : fecha;
    const p = new URLSearchParams({ vista: v });
    if (f && f !== todayISO()) p.set('fecha', f);
    location.hash = `#/calendario?${p}`;
  };
  const shift = (dir) => {
    if (vista === 'semana') return go({ fecha: addDaysISO(fecha, 7 * dir) });
    const d = fromISO(fecha);
    d.setDate(1);
    d.setMonth(d.getMonth() + dir);
    go({ fecha: toISO(d) });
  };

  // ---- Cabecera
  const mon = mondayOf(fecha);
  const fd = fromISO(fecha);
  const eyebrowText = vista === 'semana' ? `Semana del ${shortDate(mon)} al ${shortDate(addDaysISO(mon, 4))}`
    : vista === 'mes' ? `${cap(MESES[fd.getMonth()])} ${fd.getFullYear()}` : 'Horario semanal';

  const tabs = h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Vista del calendario' },
    VISTAS.map(([k, label]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(k === vista), tabindex: k === vista ? '0' : '-1',
      onclick: () => go({ vista: k, fecha: k === 'horario' ? null : fecha }),
      onkeydown: (e) => {
        const i = VISTAS.findIndex(([x]) => x === vista);
        const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (j !== null && VISTAS[j]) { e.preventDefault(); go({ vista: VISTAS[j][0] }); }
      },
    }, label)));

  const nav = vista === 'horario' ? null : h('div', { class: 'cal-nav' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': vista === 'semana' ? 'Semana anterior' : 'Mes anterior', onclick: () => shift(-1) }, icon('chevronLeft')),
    h('button', { type: 'button', class: 'btn', onclick: () => go({ fecha: null }) }, 'Hoy'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': vista === 'semana' ? 'Semana siguiente' : 'Mes siguiente', onclick: () => shift(1) }, icon('chevronRight')));

  const body = h('div', { class: 'cal-body', id: 'cal-body' });
  const banner = calendarBanner();
  container.replaceChildren(h('div', { class: 'cal-view' },
    h('header', { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, eyebrowText), h('h1', { class: 'page-title' }, 'Calendario')),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openEventEditor(null, { fecha: vista === 'mes' ? selDay : (validISO(fecha) ? fecha : todayISO()) }) },
        icon('plus', 18), 'Nuevo evento')),
    banner.el,
    h('div', { class: 'cal-toolbar' }, nav || h('span'), tabs),
    body));

  // ---- Pintado
  function paint() {
    const snap = snapshot();
    const phone = mq.matches;
    let node;
    if (vista === 'semana') node = phone ? weekAgenda(snap) : weekGrid(snap);
    else if (vista === 'mes') node = monthView(snap, phone);
    else node = horarioView(snap, phone);
    body.replaceChildren(node);
  }

  // ===================== SEMANA =====================
  /** Días visibles: lunes a viernes, más sábado/domingo solo si tienen eventos. */
  function weekDays(snap) {
    const days = [0, 1, 2, 3, 4].map((i) => addDaysISO(mon, i));
    for (const off of [5, 6]) { const iso = addDaysISO(mon, off); if (snap.eventsOn(iso).length) days.push(iso); }
    return days;
  }

  function weekGrid(snap) {
    const days = weekDays(snap);
    const today = todayISO();

    // Rango horario: de la primera hora de inicio a la última hora de fin (por defecto 9:00-14:00)
    let lo = Infinity, hi = -Infinity;
    for (const s of snap.sessions) { lo = Math.min(lo, toMin(s.inicio)); hi = Math.max(hi, toMin(s.fin)); }
    for (const iso of days) for (const ev of snap.eventsOn(iso)) {
      if (!isAllDay(ev)) { lo = Math.min(lo, toMin(ev.hora)); hi = Math.max(hi, toMin(ev.hora) + 45); }
    }
    if (!isFinite(lo)) { lo = 9 * 60; hi = 14 * 60; }
    lo = Math.floor(lo / 60) * 60;
    hi = Math.ceil(hi / 60) * 60;
    const heightPx = ((hi - lo) / 60) * HOUR_PX;
    const yOf = (min) => ((min - lo) / 60) * HOUR_PX;

    const cols = `46px ${days.map((iso) => (isoDia(iso) > 5 ? 'minmax(0,.55fr)' : 'minmax(0,1fr)')).join(' ')}`;
    const wrap = h('div', { class: 'cal-week', style: `--cols:${cols};--h:${heightPx}px` });

    const nolec = (iso) => snap.eventsOn(iso).some((e) => e.tipo === 'nolectivo');
    const cls = (iso, extra = '') => [iso === today ? 'is-today' : '', isoDia(iso) > 5 ? 'is-weekend' : '', nolec(iso) ? 'nolectivo' : '', extra].filter(Boolean).join(' ');

    // Cabecera
    wrap.append(h('div', { class: 'cal-wrow cal-whead' }, h('div'),
      days.map((iso) => h('div', { class: iso === today ? 'is-today' : '' },
        h('span', { class: 'cal-dname' }, DIAS_CORTO[fromISO(iso).getDay()]),
        h('span', { class: 'cal-dnum' }, dayNum(iso))))));

    // Eventos de todo el día / varios días
    if (days.some((iso) => snap.eventsOn(iso).some(isAllDay))) {
      wrap.append(h('div', { class: 'cal-wrow cal-allday' }, h('div'),
        days.map((iso) => h('div', { class: cls(iso) },
          snap.eventsOn(iso).filter(isAllDay).map((ev) => eventChip(ev))))));
    }

    // Cuerpo: rejilla horaria
    const gutter = h('div', { class: 'cal-gutter', style: `height:${heightPx}px` });
    for (let m = lo; m < hi; m += 60) gutter.append(h('span', { style: `top:${yOf(m)}px` }, `${m / 60}:00`));
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    wrap.append(h('div', { class: 'cal-wrow cal-wbody' }, gutter, days.map((iso) => {
      const col = h('div', { class: `cal-col ${cls(iso)}`, role: 'group', 'aria-label': `${DIAS_CORTO[fromISO(iso).getDay()]} ${dayNum(iso)}` });
      for (const s of snap.sessionsOn(iso)) {
        const top = yOf(toMin(s.inicio)), height = ((toMin(s.fin) - toMin(s.inicio)) / 60) * HOUR_PX - 2;
        col.append(h('button', {
          type: 'button', class: `cal-block ${sessionTone(s)}${height < 58 ? ' compact' : ''}`,
          style: `top:${top + 1}px;height:${height}px`, title: `${sessionTitle(s)} · ${sessionSub(s)}`,
          onclick: () => openSessionDetail(s),
        }, h('span', { class: 'cal-block-time' }, `${s.inicio}–${s.fin}`),
        h('span', { class: 'cal-block-title' }, sessionTitle(s)),
        s.tipo !== 'recreo' && (groupName(s.groupId) || s.apoyo) ? h('span', { class: 'cal-block-sub' }, [groupName(s.groupId), s.apoyo ? `+ ${s.apoyo}` : ''].filter(Boolean).join(' · ')) : null));
      }
      for (const ev of snap.eventsOn(iso).filter((e) => !isAllDay(e))) {
        col.append(h('button', {
          type: 'button', class: `cal-ev ${evColor(ev)}`, style: `top:${yOf(toMin(ev.hora))}px`,
          title: `${ev.titulo} · ${ev.hora}`, onclick: () => openEventEditor(ev),
        }, h('b', {}, ev.hora), h('span', {}, ev.titulo)));
      }
      if (iso === today && nowMin >= lo && nowMin <= hi) col.append(h('div', { class: 'cal-now', style: `top:${yOf(nowMin)}px`, 'aria-hidden': 'true' }));
      return col;
    })));

    // Tareas con vencimiento
    if (days.some((iso) => snap.tasksOn(iso).length)) {
      wrap.append(h('div', { class: 'cal-wrow cal-tasksrow' }, h('div'),
        days.map((iso) => {
          const n = snap.tasksOn(iso).length;
          return h('div', { class: cls(iso) }, n ? h('a', { class: 'cal-tasklink', href: '#/tareas' }, plural(n, 'tarea', 'tareas')) : null);
        })));
    }
    return wrap;
  }

  /** Semana en móvil: lista vertical, una tarjeta por día. */
  function weekAgenda(snap) {
    const today = todayISO();
    return h('div', { class: 'cal-agenda' }, weekDays(snap).map((iso) => {
      const evs = snap.eventsOn(iso);
      const nolec = evs.some((e) => e.tipo === 'nolectivo');
      const tasks = snap.tasksOn(iso);
      const rows = [
        ...evs.filter(isAllDay).map((ev) => ({ at: '', node: eventRow(ev) })),
        ...[...snap.sessionsOn(iso).map((s) => ({ at: s.inicio, node: sessionRow(s, nolec) })),
          ...evs.filter((e) => !isAllDay(e)).map((ev) => ({ at: ev.hora, node: eventRow(ev) }))]
          .sort((a, b) => a.at.localeCompare(b.at)),
      ].map((r) => r.node);
      return h('section', { class: `card${iso === today ? ' is-today' : ''}`, 'aria-label': `${cap(DIAS_CORTO[fromISO(iso).getDay()])} ${dayNum(iso)}` },
        h('div', { class: 'cal-ahead' },
          h('h2', {}, `${cap(['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][fromISO(iso).getDay()])} ${dayNum(iso)}`),
          iso === today ? h('span', { class: 'chip' }, 'Hoy') : h('span', { class: 'cal-muted' }, shortDate(iso)),
          h('button', { type: 'button', class: 'link-btn', style: 'margin-left:auto;min-height:44px', onclick: () => openEventEditor(null, { fecha: iso }) }, '+ Evento')),
        rows.length ? rows : h('p', { class: 'cal-muted', style: 'margin:4px 8px 10px' }, 'Sin actividad'),
        tasks.length ? h('a', { class: 'cal-tasks-line', href: '#/tareas' }, plural(tasks.length, 'tarea', 'tareas')) : null);
    }));
  }

  // ===================== MES =====================
  function monthView(snap, phone) {
    const first = new Date(fd.getFullYear(), fd.getMonth(), 1);
    const firstISO = toISO(first);
    const gridStart = mondayOf(firstISO);
    const nDays = new Date(fd.getFullYear(), fd.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((isoDia(firstISO) - 1 + nDays) / 7);
    const today = todayISO();
    const month = fd.getMonth();
    if (fromISO(selDay).getMonth() !== month) selDay = (fromISO(today).getMonth() === month && fromISO(today).getFullYear() === fd.getFullYear()) ? today : firstISO;

    const grid = h('div', { class: `cal-month${phone ? ' is-phone' : ''}` },
      ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => h('div', { class: 'cal-mh' }, d)));

    for (let i = 0; i < weeks * 7; i++) {
      const iso = addDaysISO(gridStart, i);
      const d = fromISO(iso);
      const evs = snap.eventsOn(iso);
      const tasks = snap.tasksOn(iso);
      const classes = ['cal-cell',
        d.getMonth() !== month && 'out', iso === today && 'today', isoDia(iso) > 5 && 'weekend',
        evs.some((e) => e.tipo === 'nolectivo') && 'nolectivo', phone && iso === selDay && 'sel'].filter(Boolean).join(' ');
      const open = () => (phone ? ((selDay = iso), paint()) : openDaySheet(iso));
      const label = `${d.getDate()} de ${MESES[d.getMonth()]}${evs.length ? `, ${plural(evs.length, 'evento', 'eventos')}` : ''}${tasks.length ? `, ${plural(tasks.length, 'tarea', 'tareas')}` : ''}`;
      const cell = h('div', { class: classes, onclick: open },
        h('button', { type: 'button', class: 'cal-daynum', 'aria-label': label, 'aria-current': iso === today ? 'date' : null, onclick: (e) => { e.stopPropagation(); open(); } }, String(d.getDate())));
      if (phone) {
        const dots = h('div', { class: 'cal-dots', 'aria-hidden': 'true' },
          evs.slice(0, 3).map((e) => h('span', { class: `cal-dot ${evColor(e)}` })),
          tasks.length ? h('span', { class: 'cal-dot task' }) : null);
        cell.append(dots);
      } else {
        evs.slice(0, 3).forEach((ev) => cell.append(eventChip(ev, { time: false })));
        if (evs.length > 3) cell.append(h('button', { type: 'button', class: 'cal-more', onclick: (e) => { e.stopPropagation(); openDaySheet(iso); } }, `+${evs.length - 3} más`));
        if (tasks.length) {
          cell.append(h('div', { class: 'cal-dots', title: plural(tasks.length, 'tarea', 'tareas'), 'aria-label': plural(tasks.length, 'tarea', 'tareas') },
            tasks.slice(0, 4).map(() => h('span', { class: 'cal-dot task' }))));
        }
      }
      grid.append(cell);
    }

    if (!phone) return grid;
    // Móvil: debajo de la rejilla, el detalle del día elegido
    const sel = fromISO(selDay);
    return h('div', {}, grid, h('section', { class: 'card cal-selday cal-sheet' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, `${cap(['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][sel.getDay()])} ${sel.getDate()} de ${MESES[sel.getMonth()]}`)),
      dayDetail(selDay, snap, () => {})));
  }

  // ===================== HORARIO =====================
  function horarioView(snap, phone) {
    const slots = allSlots(snap.sessions);
    if (!slots.length) {
      return h('div', { class: 'card cal-setup-empty' },
        h('div', { class: 'empty' }, icon('clock', 40),
          h('strong', {}, 'Aún no has creado tu horario'),
          'Define las franjas de tu jornada y luego rellena cada casilla con tus clases.'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: openSetupSheet }, icon('plus', 18), 'Crear horario'));
    }
    const today = isoDia(todayISO());
    const noGroups = !getGroups().length;
    const foot = h('div', { class: 'cal-hor-foot' },
      h('p', { class: 'cal-hint' }, noGroups
        ? h('span', {}, 'Toca una casilla para rellenarla. ', h('a', { href: '#/grupos' }, 'Crea tus grupos en Grupos'), ' para asignarlos.')
        : 'Toca una casilla para rellenarla o cambiarla.'),
      h('button', { type: 'button', class: 'btn', onclick: () => openFranjaSheet(slots) }, icon('plus', 18), 'Añadir franja'));

    const cellFor = (dia, slot, s) => {
      const lbl = `${DIAS_LECTIVOS[dia - 1]}, ${slot.inicio} a ${slot.fin}`;
      if (!s) {
        return h('button', {
          type: 'button', class: 'cal-hcell empty', 'aria-label': `Añadir sesión: ${lbl}`,
          onclick: () => openSessionEditor({ dia, inicio: slot.inicio, fin: slot.fin, tipo: slot.tipo }),
        }, icon('plus', 16));
      }
      return h('button', {
        type: 'button', class: `cal-hcell filled ${sessionTone(s)}`, 'aria-label': `${sessionTitle(s)}. ${lbl}. Editar`,
        onclick: () => openSessionEditor({ session: s }),
      }, h('b', {}, sessionTitle(s)),
      s.tipo === 'recreo' ? null : groupName(s.groupId) ? h('span', {}, groupName(s.groupId)) : null,
      s.aula ? h('span', {}, s.aula) : null,
      s.apoyo ? h('span', { class: 'cal-apoyo' }, `Apoyo: ${s.apoyo}`) : null);
    };

    if (phone) {
      const chips = h('div', { class: 'cal-daychips', role: 'group', 'aria-label': 'Día de la semana' },
        DIAS_INI.map((l, i) => h('button', {
          type: 'button', class: i + 1 === today ? 'is-today' : '', 'aria-pressed': String(horDia === i + 1), 'aria-label': DIAS_LECTIVOS[i],
          onclick: () => { horDia = i + 1; paint(); },
        }, l)));
      const list = h('div', { class: 'cal-hlist' }, slots.map((slot) => h('div', { class: `cal-hitem${slot.tipo === 'recreo' ? ' is-recreo' : ''}` },
        h('button', { type: 'button', class: 'cal-htime', style: 'background:none;border:0;cursor:pointer', 'aria-label': `Editar franja ${slot.inicio} a ${slot.fin}`, onclick: () => openSlotSheet(slot) },
          slot.inicio, h('br'), slot.fin),
        h('div', { style: 'flex:1;min-width:0;display:flex' }, cellFor(horDia, slot, sessionAt(snap.sessions, horDia, slot))))));
      return h('div', {}, chips, h('div', { class: 'card', style: 'padding:12px' }, h('h2', { class: 'section-label', style: 'padding:4px 4px 0' }, DIAS_LECTIVOS[horDia - 1]), list), foot);
    }

    const grid = h('div', { class: 'cal-hor' },
      h('div', { class: 'cal-hrow cal-hhead' }, h('div'), DIAS_LECTIVOS.map((d, i) => h('div', { class: i + 1 === today ? 'is-today' : '' }, d))),
      slots.map((slot) => h('div', { class: `cal-hrow${slot.tipo === 'recreo' ? ' is-recreo' : ''}` },
        h('button', { type: 'button', class: 'cal-slot', 'aria-label': `Editar franja ${slot.inicio} a ${slot.fin}`, onclick: () => openSlotSheet(slot) },
          h('strong', {}, slot.inicio), h('small', {}, `hasta ${slot.fin}`)),
        [1, 2, 3, 4, 5].map((dia) => h('div', { class: 'cal-hcellwrap' }, cellFor(dia, slot, sessionAt(snap.sessions, dia, slot)))))));
    return h('div', {}, grid, foot);
  }

  // ---- Suscripciones y limpieza
  let raf = 0;
  const repaint = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); };
  paint();
  const unsubs = ['schedule', 'events', 'tasks', 'groups', 'settings'].map((c) => store.subscribe(c, repaint));
  mq.addEventListener('change', repaint);
  const timer = setInterval(() => { if (vista === 'semana') paint(); }, 60000); // mueve la línea de «ahora»

  if (pendingEdit && vista === 'horario') {
    const s = store.get('schedule', pendingEdit);
    pendingEdit = null;
    if (s) openSessionEditor({ session: s });
  }

  return () => {
    unsubs.forEach((u) => u());
    banner.destroy();
    mq.removeEventListener('change', repaint);
    clearInterval(timer);
    cancelAnimationFrame(raf);
    [...openSheets].forEach((c) => c());
  };
}

// =====================================================================
// Piezas compartidas
// =====================================================================
/** Chip de evento (pulsable: abre el editor). */
function eventChip(ev, { time = true } = {}) {
  const t = time && ev.hora && !isMultiDay(ev) ? `${ev.hora} ` : '';
  return h('button', {
    type: 'button', class: `cal-chip ${evColor(ev)}`, title: `${ev.titulo} · ${eventSub(ev)}${ev.asistente ? ` · ${asistenteDetail(ev.asistente)}` : ''}`,
    onclick: (e) => { e.stopPropagation(); openEventEditor(ev); },
  }, t ? h('b', {}, t) : null, ev.titulo);
}

function eventRow(ev) {
  return h('button', { type: 'button', class: `cal-row ${evColor(ev)}`, onclick: () => openEventEditor(ev) },
    h('span', { class: 'cal-bar' }),
    h('span', { class: 'cal-row-main' }, h('span', { class: 'cal-row-title' }, ev.titulo), h('span', { class: 'cal-row-sub' }, eventSub(ev))),
    asistenteChip(ev));
}

function sessionRow(s, dim = false) {
  const tone = sessionTone(s);
  return h('button', { type: 'button', class: `cal-row ${tone}${dim ? ' dim' : ''}`, onclick: () => openSessionDetail(s) },
    h('span', { class: 'cal-bar' }),
    h('span', { class: 'cal-row-main' },
      h('span', { class: 'cal-row-title' }, sessionTitle(s)),
      h('span', { class: 'cal-row-sub' }, sessionSub(s))));
}

/** Contenido con los eventos, clases y tareas de un día (hoja o lista inline). */
function dayDetail(iso, snap, close) {
  const evs = snap.eventsOn(iso), sess = snap.sessionsOn(iso), tasks = snap.tasksOn(iso);
  const nolec = evs.some((e) => e.tipo === 'nolectivo');
  const wrap = h('div', { class: 'cal-sheet' });
  if (nolec) wrap.append(h('div', { class: 'cal-banner' }, 'Día no lectivo'));
  const sec = (label, items) => items.length && wrap.append(h('h3', { class: 'section-label' }, label), ...items);
  sec('Eventos', evs.map((ev) => { const r = eventRow(ev); r.addEventListener('click', () => close()); return r; }));
  sec('Horario', sess.map((s) => { const r = sessionRow(s, nolec); r.addEventListener('click', () => close()); return r; }));
  sec('Tareas', tasks.map((t) => h('a', { class: 'cal-row neutral', href: '#/tareas', onclick: () => close() },
    h('span', { class: 'cal-bar' }), h('span', { class: 'cal-row-main' }, h('span', { class: 'cal-row-title' }, t.title || t.text || 'Tarea')))));
  if (!evs.length && !sess.length && !tasks.length) wrap.append(h('p', { class: 'cal-muted' }, 'No hay nada previsto este día.'));
  wrap.append(h('button', { type: 'button', class: 'btn full', onclick: () => { close(); openEventEditor(null, { fecha: iso }); } }, icon('plus', 18), 'Añadir evento'));
  if (isoDia(iso) <= 5) {
    wrap.append(h('button', { type: 'button', class: 'btn full', style: { marginTop: '8px' }, onclick: () => { close(); import('./sustituto.js').then((m) => m.openSustituto({ fecha: iso })); } }, icon('note', 18), 'Plan para el sustituto'));
  }
  return wrap;
}

function openDaySheet(iso) {
  const d = fromISO(iso);
  let close;
  const node = dayDetail(iso, snapshot(), () => close());
  close = sheet(`${cap(['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()])}, ${d.getDate()} de ${MESES[d.getMonth()]}`, node);
}

function openSessionDetail(s) {
  let close;
  const g = getGroup(s.groupId);
  const dl = h('dl', {},
    h('dt', {}, 'Día'), h('dd', {}, DIAS_LECTIVOS[s.dia - 1]),
    h('dt', {}, 'Hora'), h('dd', {}, `${s.inicio} – ${s.fin}`),
    s.tipo === 'clase' ? [h('dt', {}, 'Área'), h('dd', {}, s.area || 'Sin área')] : [h('dt', {}, 'Tipo'), h('dd', {}, s.tipo === 'recreo' ? 'Recreo' : 'Otra actividad')],
    g ? [h('dt', {}, 'Grupo'), h('dd', {}, g.nombre)] : null,
    s.aula ? [h('dt', {}, 'Aula'), h('dd', {}, s.aula)] : null,
    s.apoyo ? [h('dt', {}, 'Apoyo'), h('dd', {}, s.apoyo)] : null,
    s.tipo !== 'clase' && s.titulo ? [h('dt', {}, 'Título'), h('dd', {}, s.titulo)] : null);
  const node = h('div', { class: 'cal-sheet cal-detail' }, dl,
    h('button', {
      type: 'button', class: 'btn btn-primary full',
      onclick: () => { close(); pendingEdit = s.id; location.hash = '#/calendario?vista=horario'; },
    }, 'Editar en Horario'));
  close = sheet(sessionTitle(s), node);
}

// =====================================================================
// Editor de eventos
// =====================================================================
function openEventEditor(ev, defaults = {}) {
  const isNew = !ev;
  const base = ev || { titulo: '', tipo: 'otro', fecha: todayISO(), fechaFin: null, hora: null, groupId: null, notas: '', ...defaults };
  let close;

  const titulo = h('input', { type: 'text', class: 'input', value: base.titulo, maxlength: '120', autocomplete: 'off', placeholder: 'Ej.: Reunión de ciclo' });
  const tipo = h('select', { class: 'select' },
    Object.entries(EVENT_TYPES).map(([k, v]) => h('option', { value: k, selected: k === base.tipo }, v.label)));
  const fechaIn = h('input', { type: 'date', class: 'input', value: base.fecha });
  const multi = toggle('Varios días', isMultiDay(base), () => sync());
  const finIn = h('input', { type: 'date', class: 'input', value: isMultiDay(base) ? base.fechaFin : base.fecha });
  const allDay = toggle('Todo el día', !base.hora, () => sync());
  const horaIn = h('input', { type: 'time', class: 'input', value: base.hora || '09:00' });
  const groups = getGroups();
  if (base.groupId && !groups.some((g) => g.id === base.groupId) && getGroup(base.groupId)) groups.push(getGroup(base.groupId));
  const grupo = h('select', { class: 'select' },
    h('option', { value: '' }, 'Sin grupo'),
    groups.map((g) => h('option', { value: g.id, selected: g.id === base.groupId }, g.nombre)));
  // Programa (opcional): solo si existen programas; se conserva el vinculado aunque esté archivado
  const progs = getPrograms();
  if (base.programaId && !progs.some((p) => p.id === base.programaId)) { const cur = store.get('programas', base.programaId); if (cur) progs.push(cur); }
  const programa = h('select', { class: 'select' },
    h('option', { value: '' }, 'Ninguno'),
    progs.map((p) => h('option', { value: p.id, selected: p.id === base.programaId }, p.nombre)));
  const notas = h('textarea', { class: 'textarea', rows: '3', placeholder: 'Opcional' }, base.notas || '');
  notas.value = base.notas || '';
  const err = h('p', { class: 'cal-error', role: 'alert', hidden: true });

  const finField = field('Hasta el día', finIn);
  const horaField = field('Hora', horaIn);
  function sync() { finField.hidden = !multi.input.checked; horaField.hidden = allDay.input.checked; }
  sync();

  const fail = (msg, el) => { err.textContent = msg; err.hidden = false; el && el.focus(); };

  const save = (e) => {
    e.preventDefault();
    const t = titulo.value.trim();
    if (!t) return fail('Escribe un título para el evento.', titulo);
    if (!fechaIn.value) return fail('Elige una fecha.', fechaIn);
    if (!allDay.input.checked && !horaIn.value) return fail('Indica la hora o marca «Todo el día».', horaIn);
    let fin = null;
    if (multi.input.checked && finIn.value && finIn.value > fechaIn.value) fin = finIn.value;
    const data = {
      titulo: t, tipo: tipo.value, fecha: fechaIn.value, fechaFin: fin,
      hora: allDay.input.checked ? null : horaIn.value, groupId: grupo.value || null, notas: notas.value.trim(),
    };
    if (progs.length) data.programaId = programa.value || null;
    if (isNew) store.add('events', data); else store.update('events', ev.id, data);
    close();
    toast(isNew ? 'Evento añadido' : 'Evento guardado');
  };

  const remove = () => {
    const removed = store.remove('events', ev.id);
    close();
    toast('Evento eliminado', { label: 'Deshacer', run: () => store.restore('events', removed) });
  };

  const form = h('form', { class: 'cal-sheet cal-form', onsubmit: save, novalidate: true },
    asistenteChip(base) ? h('div', { class: 'as-mark-row' }, asistenteChip(base), h('span', {}, asistenteDetail(base.asistente))) : null,
    field('Título', titulo), field('Tipo', tipo),
    h('div', { class: 'cal-two' }, field('Fecha', fechaIn), finField),
    multi.el,
    allDay.el, horaField,
    groups.length ? field('Grupo', grupo) : null,
    progs.length ? field('Programa', programa) : null,
    field('Notas', notas), err,
    h('div', { class: 'cal-actions' },
      isNew ? null : h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: remove }, icon('trash', 18), 'Eliminar'),
      h('div', { class: 'right' },
        h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar'))));
  close = sheet(isNew ? 'Nuevo evento' : 'Editar evento', form);
  if (isNew) setTimeout(() => titulo.focus(), 250);
}

// =====================================================================
// Editor de sesiones del horario
// =====================================================================
/** init: { session } para editar, o { dia, inicio, fin, tipo } para crear en una casilla. */
function openSessionEditor(init) {
  const s = init.session || null;
  const base = s || { dia: init.dia, inicio: init.inicio || '09:00', fin: init.fin || '10:00', tipo: init.tipo || 'clase', area: '', groupId: null, titulo: '', aula: '' };
  let close;

  const tipo = h('select', { class: 'select' }, TIPOS_SESION.map(([k, l]) => h('option', { value: k, selected: k === base.tipo }, l)));
  const area = h('select', { class: 'select' }, h('option', { value: '' }, '— Elige un área —'),
    AREAS.map((a) => h('option', { value: a, selected: a === base.area }, a)));
  const groups = getGroups();
  if (base.groupId && !groups.some((g) => g.id === base.groupId) && getGroup(base.groupId)) groups.push(getGroup(base.groupId));
  const grupo = h('select', { class: 'select' }, h('option', { value: '' }, 'Sin grupo'),
    groups.map((g) => h('option', { value: g.id, selected: g.id === base.groupId }, g.nombre)));
  const aula = h('input', { type: 'text', class: 'input', value: base.aula || '', maxlength: '40', placeholder: 'Opcional', autocomplete: 'off' });
  // Docente que entra a apoyar en esta sesión (solo este día)
  const apoyo = h('input', { type: 'text', class: 'input', value: base.apoyo || '', maxlength: '40', placeholder: 'Ej.: Pili', autocomplete: 'off' });
  const titulo = h('input', { type: 'text', class: 'input', value: base.titulo || '', maxlength: '60', autocomplete: 'off' });
  const ini = h('input', { type: 'time', class: 'input', value: base.inicio });
  const fin = h('input', { type: 'time', class: 'input', value: base.fin });
  const err = h('p', { class: 'cal-error', role: 'alert', hidden: true });

  const areaField = field('Área', area);
  const grupoField = field('Grupo', grupo, groups.length ? null
    : h('span', { class: 'cal-muted' }, 'Crea tus grupos en ', h('a', { href: '#/grupos', onclick: () => close() }, 'Grupos'), '.'));
  const tituloField = field('Título', titulo);
  const sync = () => {
    const t = tipo.value;
    areaField.hidden = t !== 'clase';
    grupoField.hidden = t === 'recreo';
    tituloField.hidden = t === 'clase';
    titulo.placeholder = t === 'recreo' ? 'Recreo' : 'Ej.: Guardia, coordinación…';
  };
  tipo.addEventListener('change', sync);
  sync();

  // «Aplicar también a…»: el día actual queda marcado y fijo.
  const dayBoxes = DIAS_LECTIVOS.map((name, i) => {
    const dia = i + 1, current = dia === base.dia;
    const box = h('input', { type: 'checkbox', checked: current, disabled: current, value: String(dia) });
    return { dia, box, el: h('label', { class: `cal-daycheck${current ? ' fixed' : ''}` }, box, name.slice(0, 3)) };
  });

  const fail = (msg, el) => { err.textContent = msg; err.hidden = false; el && el.focus(); };

  const save = (e) => {
    e.preventDefault();
    if (!ini.value || !fin.value) return fail('Indica la hora de inicio y de fin.', ini);
    if (toMin(fin.value) <= toMin(ini.value)) return fail('La hora de fin debe ser posterior a la de inicio.', fin);
    const t = tipo.value;
    const data = {
      inicio: ini.value, fin: fin.value, tipo: t,
      area: t === 'clase' ? area.value : '',
      groupId: t !== 'recreo' && grupo.value ? grupo.value : null,
      titulo: t === 'clase' ? '' : (titulo.value.trim() || (t === 'recreo' ? 'Recreo' : '')),
      aula: aula.value.trim(),
    };
    const dias = [base.dia, ...dayBoxes.filter((b) => b.box.checked && b.dia !== base.dia).map((b) => b.dia)];
    const all = store.list('schedule');
    for (const dia of dias) {
      // Si ya hay una sesión exactamente en esa franja, se sustituye; si no, se crea.
      const same = (x) => x.dia === dia && x.inicio === data.inicio && x.fin === data.fin;
      const target = dia === base.dia && s ? s : all.find(same);
      // El apoyo es propio de cada día: solo se guarda en el día que se está editando
      const extra = dia === base.dia ? { apoyo: t === 'recreo' ? '' : apoyo.value.trim() } : {};
      if (target) store.update('schedule', target.id, { ...data, ...extra, dia });
      else store.add('schedule', { ...data, apoyo: '', ...extra, dia });
    }
    ensureFranja({ inicio: data.inicio, fin: data.fin, tipo: t });
    close();
    toast(dias.length > 1 ? `Sesión guardada en ${dias.length} días` : 'Sesión guardada');
  };

  const remove = () => {
    const removed = store.remove('schedule', s.id);
    close();
    toast('Sesión eliminada', { label: 'Deshacer', run: () => store.restore('schedule', removed) });
  };

  const form = h('form', { class: 'cal-sheet cal-form', onsubmit: save, novalidate: true },
    h('p', { class: 'cal-muted', style: 'margin:0 0 14px' }, DIAS_LECTIVOS[base.dia - 1]),
    field('Tipo', tipo), areaField, grupoField, tituloField,
    h('div', { class: 'cal-two' }, field('Aula', aula), field('Apoyo en el aula', apoyo)),
    h('div', { class: 'cal-two' }, field('Inicio', ini), field('Fin', fin)),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Aplicar también a…'), h('div', { class: 'cal-daychecks' }, dayBoxes.map((b) => b.el))),
    err,
    h('div', { class: 'cal-actions' },
      s ? h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: remove }, icon('trash', 18), 'Eliminar') : null,
      h('div', { class: 'right' },
        h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar'))));
  close = sheet(s ? 'Editar sesión' : 'Nueva sesión', form);
}

// =====================================================================
// Franjas: configuración inicial, alta y edición
// =====================================================================
/** Guarda una franja en el ajuste si todavía no existe. */
function ensureFranja(f) {
  const list = getFranjas();
  if (list.some((x) => x.inicio === f.inicio && x.fin === f.fin)) return;
  list.push(f);
  list.sort((a, b) => a.inicio.localeCompare(b.inicio));
  store.setSetting('horarioFranjas', list);
}

function openSetupSheet() {
  let close;
  const ini = h('input', { type: 'time', class: 'input', value: '09:00' });
  const dur = h('select', { class: 'select' }, [45, 60].map((m) => h('option', { value: m, selected: m === 60 }, `${m} minutos`)));
  const num = h('input', { type: 'number', class: 'input', min: '1', max: '10', value: '5', inputmode: 'numeric' });
  const rec = h('input', { type: 'number', class: 'input', min: '0', max: '10', value: '3', inputmode: 'numeric' });
  const recLen = h('select', { class: 'select' }, [20, 30, 45].map((m) => h('option', { value: m, selected: m === 30 }, `${m} minutos`)));
  const err = h('p', { class: 'cal-error', role: 'alert', hidden: true });

  const create = (e) => {
    e.preventDefault();
    const n = Math.min(10, Math.max(1, parseInt(num.value, 10) || 0));
    const after = Math.max(0, parseInt(rec.value, 10) || 0);
    if (!ini.value || !n) { err.textContent = 'Indica la hora de inicio y el número de sesiones.'; err.hidden = false; return; }
    let franjas;
    try {
      franjas = buildFranjas({
        inicio: ini.value, duracion: parseInt(dur.value, 10), sesiones: n,
        recreoTras: after, recreoDuracion: parseInt(recLen.value, 10),
      });
    } catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
    applyFranjas(franjas);
    close();
    toast('Horario creado. Toca las casillas para rellenarlas.');
  };

  const form = h('form', { class: 'cal-sheet cal-form', onsubmit: create, novalidate: true },
    h('p', { class: 'cal-muted', style: 'margin-top:0' }, 'Prepararemos las franjas de tu jornada. Después podrás ajustar cada una.'),
    h('div', { class: 'cal-two' }, field('Empieza a las', ini), field('Duración de cada sesión', dur)),
    h('div', { class: 'cal-two' }, field('Número de sesiones', num), field('Recreo tras la sesión nº', rec, h('span', { class: 'cal-muted' }, '0 = sin recreo'))),
    field('Duración del recreo', recLen), err,
    h('div', { class: 'cal-actions' }, h('div', { class: 'right' },
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Crear horario'))));
  close = sheet('Crear horario', form);
}

/** Añadir una franja (fila) nueva al horario. */
function openFranjaSheet(slots) {
  let close;
  const last = slots[slots.length - 1];
  const start = last ? last.fin : '09:00';
  const ini = h('input', { type: 'time', class: 'input', value: start });
  const fin = h('input', { type: 'time', class: 'input', value: fmtMin(Math.min(toMin(start) + 60, 23 * 60 + 59)) });
  const tipo = h('select', { class: 'select' }, TIPOS_SESION.map(([k, l]) => h('option', { value: k }, l)));
  const err = h('p', { class: 'cal-error', role: 'alert', hidden: true });
  const save = (e) => {
    e.preventDefault();
    if (!ini.value || !fin.value || toMin(fin.value) <= toMin(ini.value)) { err.textContent = 'La hora de fin debe ser posterior a la de inicio.'; err.hidden = false; return; }
    if (slots.some((x) => x.inicio === ini.value && x.fin === fin.value)) { err.textContent = 'Ya existe una franja con esas horas.'; err.hidden = false; return; }
    const f = { inicio: ini.value, fin: fin.value, tipo: tipo.value };
    ensureFranja(f);
    fillFranja(f);
    close();
    toast('Franja añadida');
  };
  close = sheet('Añadir franja', h('form', { class: 'cal-sheet cal-form', onsubmit: save, novalidate: true },
    h('div', { class: 'cal-two' }, field('Inicio', ini), field('Fin', fin)),
    field('Tipo', tipo), err,
    h('div', { class: 'cal-actions' }, h('div', { class: 'right' },
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Añadir')))));
}

/** Cambiar las horas de una franja (y de sus sesiones) o eliminarla. */
function openSlotSheet(slot) {
  let close;
  const ini = h('input', { type: 'time', class: 'input', value: slot.inicio });
  const fin = h('input', { type: 'time', class: 'input', value: slot.fin });
  const err = h('p', { class: 'cal-error', role: 'alert', hidden: true });
  const inSlot = (x) => x.inicio === slot.inicio && x.fin === slot.fin;

  const save = (e) => {
    e.preventDefault();
    if (!ini.value || !fin.value || toMin(fin.value) <= toMin(ini.value)) { err.textContent = 'La hora de fin debe ser posterior a la de inicio.'; err.hidden = false; return; }
    store.list('schedule').filter(inSlot).forEach((x) => store.update('schedule', x.id, { inicio: ini.value, fin: fin.value }));
    const list = getFranjas().filter((x) => !(x.inicio === slot.inicio && x.fin === slot.fin));
    list.push({ inicio: ini.value, fin: fin.value, tipo: slot.tipo });
    list.sort((a, b) => a.inicio.localeCompare(b.inicio));
    store.setSetting('horarioFranjas', list);
    close();
    toast('Franja actualizada');
  };

  const remove = () => {
    const prevFranjas = getFranjas();
    const removed = store.list('schedule').filter(inSlot).map((x) => store.remove('schedule', x.id));
    store.setSetting('horarioFranjas', prevFranjas.filter((x) => !(x.inicio === slot.inicio && x.fin === slot.fin)));
    close();
    toast('Franja eliminada', { label: 'Deshacer', run: () => { removed.forEach((x) => store.restore('schedule', x)); store.setSetting('horarioFranjas', prevFranjas); } });
  };

  close = sheet('Editar franja', h('form', { class: 'cal-sheet cal-form', onsubmit: save, novalidate: true },
    h('p', { class: 'cal-muted', style: 'margin-top:0' }, 'Al cambiar las horas, se actualizan las sesiones de esta franja en todos los días.'),
    h('div', { class: 'cal-two' }, field('Inicio', ini), field('Fin', fin)), err,
    h('div', { class: 'cal-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: remove }, icon('trash', 18), 'Eliminar franja'),
      h('div', { class: 'right' },
        h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar')))));
}
