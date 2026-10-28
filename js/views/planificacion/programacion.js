// Tabula · Planificación · vista «Programación»
//
// Ruta: #/planificacion?vista=programacion&modo=semana|mes&fecha=YYYY-MM-DD[&grupo=<groupId>]
//   Semana: rejilla días × franjas del horario con la sesión planificada en cada hueco (o «+ Planificar»).
//   Mes:    filas = semanas, columnas = áreas; situaciones de cada semana, sesiones hechas/planificadas y huecos libres.
// Módulos: prog-model.js (datos), prog-sheet.js (hoja «Planificar»), prog-print.js (semana imprimible).
import { store } from '../../store.js';
import { h, icon, todayISO, addDaysISO, fromISO, DIAS } from '../../ui.js';
import { areaShort, areaColor, EVENT_TYPES, currentSchoolYear } from '../../school.js';
import { openSessionSheet } from './session-sheet.js';
import { openPlanSheet } from './prog-sheet.js';
import { buildWeekPrintHTML, printWeek } from './prog-print.js';
import {
  teacherGroups, readData, weekModel, monthModel, mondayOf, validISO, firstOfMonth, addMonths, weekLabel, monthLabel,
  weekRange, progHref, sitTone, plural, cap, isoDia, dm,
} from './prog-model.js';

const PHONE = '(max-width: 680px)';
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Pestañas «Situaciones | Programación» de la cabecera de Planificación (enlaces de navegación). */
export function viewTabs(active, { grupo = '' } = {}) {
  const go = (hash) => { location.hash = hash.slice(1); };
  const situ = grupo ? `#/planificacion?grupo=${encodeURIComponent(grupo)}` : '#/planificacion';
  return h('div', { class: 'segmented pr-tabs', role: 'group', 'aria-label': 'Vista de Planificación' },
    h('button', { type: 'button', 'aria-current': active === 'situaciones' ? 'page' : null, onclick: () => go(situ) }, 'Situaciones'),
    h('button', { type: 'button', 'aria-current': active === 'programacion' ? 'page' : null, onclick: () => go(progHref({ modo: 'semana', grupo })) }, 'Programación'));
}

export function renderProgramacion(container, params = new URLSearchParams()) {
  container.classList.add('plan-view', 'pr-view');
  const mq = window.matchMedia(PHONE);
  const today = todayISO();

  // ---------- Estado desde la URL ----------
  const modo = params.get('modo') === 'mes' ? 'mes' : 'semana';
  const rawFecha = params.get('fecha');
  let fecha = validISO(rawFecha) ? rawFecha : today;
  if (!validISO(rawFecha) && modo === 'semana' && isoDia(today) > 5) fecha = addDaysISO(today, 8 - isoDia(today)); // fin de semana: la próxima
  const monday = mondayOf(fecha);
  const first = firstOfMonth(fecha);
  const nav = (patch) => {
    const next = { modo, fecha: modo === 'mes' ? first : monday, grupo: grupoSel(), ...patch };
    location.hash = progHref(next).slice(1);
  };

  let groupFilter = params.get('grupo') || '';
  const grupoSel = () => groupFilter;

  // ---------- Piezas pequeñas ----------
  const evChip = (e) => {
    const t = EVENT_TYPES[e.tipo] || EVENT_TYPES.otro;
    return h('span', { class: `chip ${t.color} pr-evchip`, title: e.titulo || t.label }, e.titulo || t.label);
  };
  const stat = (n, one, many) => h('span', { class: 'pr-stat' }, h('b', {}, String(n)), ` ${n === 1 ? one : many}`);

  const sep = () => h('span', { class: 'pr-sep', 'aria-hidden': 'true' }, ' · ');

  function strip(lead, s) {
    const planPct = s.clases ? Math.round((s.planificadas / s.clases) * 100) : 0;
    const donePct = s.clases ? Math.round((s.hechas / s.clases) * 100) : 0;
    return h('div', { class: 'pr-strip', role: 'status' },
      h('div', { class: 'pr-strip-text' },
        h('span', { class: 'pr-strip-lead' }, `${lead}:`),
        stat(s.clases, 'clase', 'clases'), sep(), stat(s.planificadas, 'planificada', 'planificadas'), sep(),
        h('span', { class: `pr-stat${s.sinPlanificar ? ' is-warn' : ''}` }, h('b', {}, String(s.sinPlanificar)), ' sin planificar'), sep(),
        stat(s.hechas, 'hecha', 'hechas')),
      h('div', { class: 'pr-meter', 'aria-hidden': 'true' },
        h('span', { class: 'pr-meter-plan', style: { width: `${planPct}%` } }),
        h('span', { class: 'pr-meter-done', style: { width: `${donePct}%` } })));
  }

  function segmentedModo() {
    const btn = (v, text) => h('button', { type: 'button', 'aria-pressed': String(modo === v), onclick: () => modo !== v && nav({ modo: v, fecha: v === 'mes' ? firstOfMonth(fecha) : (mondayOf(fecha)) }) }, text);
    return h('div', { class: 'segmented pr-modo', role: 'group', 'aria-label': 'Modo de la programación' }, btn('semana', 'Semana'), btn('mes', 'Mes'));
  }

  function navigator() {
    const prev = modo === 'mes' ? addMonths(first, -1) : addDaysISO(monday, -7);
    const next = modo === 'mes' ? addMonths(first, 1) : addDaysISO(monday, 7);
    const label = modo === 'mes' ? monthLabel(first) : weekLabel(monday);
    return h('div', { class: 'pr-nav', role: 'group', 'aria-label': modo === 'mes' ? 'Cambiar de mes' : 'Cambiar de semana' },
      h('button', { type: 'button', class: 'icon-btn pr-arrow', 'aria-label': modo === 'mes' ? 'Mes anterior' : 'Semana anterior', onclick: () => nav({ fecha: prev }) }, '‹'),
      h('h2', { class: 'pr-nav-label', 'aria-live': 'polite' }, label),
      h('button', { type: 'button', class: 'icon-btn pr-arrow', 'aria-label': modo === 'mes' ? 'Mes siguiente' : 'Semana siguiente', onclick: () => nav({ fecha: next }) }, '›'),
      h('button', { type: 'button', class: 'btn btn-sm pr-today', onclick: () => nav({ fecha: modo === 'mes' ? firstOfMonth(today) : (isoDia(today) > 5 ? addDaysISO(today, 8 - isoDia(today)) : mondayOf(today)) }) }, 'Hoy'));
  }

  // ---------- Semana ----------
  const sitTitleOf = (data) => { const m = new Map(data.situaciones.map((s) => [s.id, s.titulo])); return (id) => m.get(id) || ''; };

  function classCell(it, iso, ctx) {
    const { block, plan, extra, group } = it;
    const tone = areaColor(block.area);
    const area = areaShort(block.area) || 'Clase';
    const groupTxt = ctx.multi && group ? group.nombre : '';
    const when = `${DIAS[fromISO(iso).getDay()]} ${fromISO(iso).getDate()}, ${block.inicio}`;
    if (plan) {
      const done = plan.estado === 'hecha', skipped = plan.estado === 'no_realizada';
      const sit = ctx.sitTitle(plan.situacionId);
      return h('button', {
        type: 'button', class: `pr-card ${tone}${done ? ' is-done' : ''}${skipped ? ' is-skipped' : ''}`,
        'aria-label': [area, groupTxt, plan.titulo || 'Sesión', sit && `situación ${sit}`, done ? 'hecha' : skipped ? 'no realizada' : '', when].filter(Boolean).join(', '),
        title: [plan.titulo, sit].filter(Boolean).join(' · '),
        onclick: () => openSessionSheet(plan.id),
      },
      h('span', { class: 'pr-card-top' },
        h('span', { class: `chip ${tone}` }, area), groupTxt ? h('span', { class: 'pr-group' }, groupTxt) : null,
        done ? h('span', { class: 'pr-check', title: 'Hecha' }, icon('check', 13)) : null,
        skipped ? h('span', { class: 'pr-skip' }, 'No realizada') : null,
        extra ? h('span', { class: 'pr-extra', title: `${plural(extra, 'sesión más', 'sesiones más')} en este hueco` }, `+${extra}`) : null),
      h('span', { class: 'pr-card-title' }, plan.titulo || 'Sesión'),
      sit ? h('span', { class: 'pr-card-sit' }, sit) : null);
    }
    if (!block.groupId || !block.area) { // clase sin grupo o área: no se puede planificar
      return h('div', { class: `pr-card pr-static ${tone}` }, h('span', { class: 'pr-card-top' }, h('span', { class: `chip ${tone}` }, area)),
        h('span', { class: 'pr-card-sit' }, 'Sin grupo asignado'));
    }
    return h('button', {
      type: 'button', class: `pr-add ${tone}`, 'aria-label': `Planificar ${area}${groupTxt ? ' de ' + groupTxt : ''}, ${when}`,
      onclick: () => openPlanSheet({ block, fecha: iso }),
    }, h('span', { class: 'pr-card-top' }, h('span', { class: `chip ${tone}` }, area), groupTxt ? h('span', { class: 'pr-group' }, groupTxt) : null),
    h('span', { class: 'pr-add-label' }, icon('plus', 14), 'Planificar'));
  }

  const breakCell = (it) => h('div', { class: `pr-break${it.block.tipo === 'otro' ? ' is-other' : ''}` },
    it.block.titulo || (it.block.tipo === 'recreo' ? 'Recreo' : 'Otra actividad'));

  const cellItems = (items, iso, ctx) => items.map((it) => (it.block.tipo === 'clase' ? classCell(it, iso, ctx) : breakCell(it)));

  function dayHeadContent(d) {
    const evs = d.events.filter((e) => e.tipo !== 'nolectivo');
    const nol = d.nolec;
    const shown = [...nol, ...evs];
    return [
      h('span', { class: 'pr-dname' }, DIAS_CORTO[fromISO(d.iso).getDay()]),
      h('span', { class: 'pr-dnum' }, String(fromISO(d.iso).getDate())),
      shown.length ? h('span', { class: 'pr-evs' }, shown.slice(0, 2).map(evChip),
        shown.length > 2 ? h('span', { class: 'pr-evmore', title: shown.slice(2).map((e) => e.titulo).join(', ') }, `+${shown.length - 2}`) : null) : null,
    ];
  }

  function weekGrid(model, ctx) {
    const { days, rows } = model;
    const head = h('tr', {}, h('th', { scope: 'col', class: 'pr-corner' }, h('span', { class: 'sr-only' }, 'Hora')),
      days.map((d) => h('th', { scope: 'col', class: `pr-dayh${d.iso === today ? ' is-today' : ''}${d.lectivo ? '' : ' is-nolec'}`, 'aria-current': d.iso === today ? 'date' : null },
        dayHeadContent(d))));
    const body = rows.map((r, ri) => h('tr', { class: r.thin ? 'is-thin' : '' },
      h('th', { scope: 'row', class: 'pr-time' }, h('span', {}, r.inicio), h('span', { class: 'pr-time-end' }, r.fin)),
      days.map((d, i) => {
        if (!d.lectivo) {
          if (ri > 0) return null;
          const t = d.nolec[0];
          return h('td', { class: 'pr-nolec', 'data-d': String(d.dia), rowspan: String(rows.length) },
            h('span', { class: 'pr-nolec-title' }, t ? t.titulo : 'No lectivo'), h('span', { class: 'pr-nolec-sub' }, 'Sin clase'));
        }
        const items = r.cells[i];
        return h('td', { 'data-d': String(d.dia), class: `pr-cell${d.iso === today ? ' is-today' : ''}${items.length ? '' : ' is-empty'}` }, cellItems(items, d.iso, ctx));
      })));
    return h('div', { class: 'pr-wrap pr-scroll', role: 'region', 'aria-label': 'Programación de la semana (desplazable)', tabindex: '0' },
      h('table', { class: 'pr-grid' },
        h('caption', { class: 'sr-only' }, `Programación semanal, ${weekLabel(model.monday)}`),
        h('thead', {}, head), h('tbody', {}, body)));
  }

  function weekAgenda(model, ctx) {
    return h('div', { class: 'pr-agenda' }, model.days.map((d, i) => {
      const dt = fromISO(d.iso);
      const evs = d.events;
      const slots = model.rows.map((r) => ({ r, items: r.cells[i] })).filter((x) => x.items.length);
      return h('section', { class: `card pr-day${d.iso === today ? ' is-today' : ''}${d.lectivo ? '' : ' is-nolec'}`, 'aria-label': `${cap(DIAS[dt.getDay()])} ${dt.getDate()}` },
        h('header', { class: 'pr-day-head' },
          h('h3', {}, `${cap(DIAS[dt.getDay()])} ${dt.getDate()}`),
          d.iso === today ? h('span', { class: 'chip t1' }, 'Hoy') : h('span', { class: 'pr-muted' }, dm(d.iso)),
          evs.length ? h('span', { class: 'pr-evs' }, evs.map(evChip)) : null),
        !d.lectivo ? h('p', { class: 'pr-muted pr-day-note' }, 'Sin clase') : (slots.length
          ? h('ul', { class: 'pr-slots' }, slots.map(({ r, items }) => h('li', { class: `pr-slot${r.thin ? ' is-thin' : ''}` },
            h('span', { class: 'pr-slot-time' }, r.inicio, h('span', { class: 'pr-time-end' }, r.fin)),
            h('div', { class: 'pr-slot-body' }, cellItems(items, d.iso, ctx)))))
          : h('p', { class: 'pr-muted pr-day-note' }, 'Sin actividad')));
    }));
  }

  function printBtn(model, ctx, groups) {
    return h('button', {
      type: 'button', class: 'btn pr-print', onclick: () => {
        const g = groups.find((x) => x.id === groupFilter);
        printWeek(buildWeekPrintHTML(model, {
          profile: store.getSetting('profile', {}) || {}, grupoNombre: g ? g.nombre : (groups.length === 1 ? groups[0].nombre : ''),
          sitTitle: ctx.sitTitle, multi: ctx.multi,
        }));
      },
    }, icon('printer', 16), h('span', {}, 'Imprimir semana'));
  }

  // ---------- Mes ----------
  const sitLine = (e, ctx) => {
    const t = e.sit ? e.sit.titulo : 'Sin situación';
    const g = ctx.multi ? ctx.data.groups.get(e.groupId) : null;
    return h('span', { class: `pr-sit chip ${e.sit ? sitTone(e.sit.id) : 't5'}`, title: `${g ? g.nombre + ' · ' : ''}${t}` }, g ? `${g.nombre} · ${t}` : t);
  };

  function monthTable(mm, ctx) {
    const head = h('tr', {}, h('th', { scope: 'col', class: 'pr-corner pr-wk-h' }, 'Semana'),
      mm.areas.map((a) => h('th', { scope: 'col', class: 'pr-areah' }, h('span', { class: `chip ${areaColor(a)}`, title: a }, areaShort(a)))),
      h('th', { scope: 'col', class: 'pr-libh', title: 'Clases de la semana sin sesión planificada' }, 'Libres'));
    const body = mm.weeks.map((w) => {
      const link = progHref({ modo: 'semana', fecha: w.monday, grupo: groupFilter });
      return h('tr', { class: w.current ? 'is-current' : '' },
        h('th', { scope: 'row', class: 'pr-wk', 'aria-current': w.current ? 'date' : null },
          h('a', { href: link, class: 'pr-wk-link' }, weekRange(w.monday)),
          w.current ? h('span', { class: 'pr-now' }, 'Esta semana') : null,
          w.events.length ? h('span', { class: 'pr-evs' }, w.events.slice(0, 2).map(evChip), w.events.length > 2 ? h('span', { class: 'pr-evmore' }, `+${w.events.length - 2}`) : null) : null),
        mm.areas.map((a) => monthCell(w, a, link, ctx)),
        h('td', { class: `pr-libres${w.libres ? ' has-free' : ''}` }, h('a', { href: link, 'aria-label': `${plural(w.libres, 'clase libre', 'clases libres')}, semana del ${weekRange(w.monday)}` }, String(w.libres))));
    });
    return h('div', { class: 'pr-wrap pr-scroll', role: 'region', 'aria-label': 'Programación del mes (desplazable)', tabindex: '0' },
      h('table', { class: 'pr-month' }, h('caption', { class: 'sr-only' }, `Programación mensual, ${monthLabel(mm.first)}`),
        h('thead', {}, head), h('tbody', {}, body)));
  }

  function monthCell(w, area, link, ctx) {
    const c = w.cells[area];
    const label = `${areaShort(area)}, semana del ${weekRange(w.monday)}: ${c.total ? `${c.hechas} de ${plural(c.total, 'sesión planificada', 'sesiones planificadas')} hechas` : (c.slots ? 'sin planificar' : 'sin clase')}`;
    if (!c.total && !c.slots) return h('td', { class: 'pr-mc is-none' }, h('a', { href: link, class: 'pr-mcell', 'aria-label': label }, h('span', { class: 'pr-dash' }, '—')));
    return h('td', { class: 'pr-mc' }, h('a', { href: link, class: 'pr-mcell', 'aria-label': label },
      c.sits.slice(0, 2).map((e) => sitLine(e, ctx)),
      c.sits.length > 2 ? h('span', { class: 'pr-evmore' }, `+${c.sits.length - 2} más`) : null,
      !c.total ? h('span', { class: 'pr-unplanned' }, 'Sin planificar') : null,
      h('span', { class: 'pr-mc-foot' },
        c.total ? h('span', { class: `pr-count${c.hechas === c.total ? ' is-all' : ''}`, title: `${c.hechas} hechas de ${c.total} planificadas` }, `${c.hechas}/${c.total}`) : null,
        c.libres && c.total ? h('span', { class: 'pr-free', title: 'Clases sin sesión planificada' }, `${c.libres} libre${c.libres === 1 ? '' : 's'}`) : null)));
  }

  function monthCards(mm, ctx) {
    return h('div', { class: 'pr-agenda' }, mm.weeks.map((w) => {
      const link = progHref({ modo: 'semana', fecha: w.monday, grupo: groupFilter });
      const rows = mm.areas.filter((a) => w.cells[a].total);
      const idle = mm.areas.filter((a) => !w.cells[a].total && w.cells[a].slots);
      return h('section', { class: `card pr-day${w.current ? ' is-today' : ''}`, 'aria-label': `Semana del ${weekRange(w.monday)}` },
        h('header', { class: 'pr-day-head' },
          h('h3', {}, h('a', { href: link }, weekRange(w.monday))),
          w.current ? h('span', { class: 'chip t1' }, 'Esta semana') : null,
          h('span', { class: `pr-libres-m${w.libres ? ' has-free' : ''}` }, plural(w.libres, 'libre', 'libres')),
          w.events.length ? h('span', { class: 'pr-evs' }, w.events.map(evChip)) : null),
        rows.length ? h('ul', { class: 'pr-mlist' }, rows.map((a) => {
          const c = w.cells[a];
          return h('li', {}, h('a', { href: link, class: 'pr-mrow', 'aria-label': `${areaShort(a)}: ${c.total ? `${c.hechas} de ${c.total} hechas` : 'sin planificar'}` },
            h('span', { class: `chip ${areaColor(a)}` }, areaShort(a)),
            h('span', { class: 'pr-mrow-sits' }, c.sits.length ? c.sits.map((e) => sitLine(e, ctx)) : h('span', { class: 'pr-unplanned' }, 'Sin planificar')),
            c.total ? h('span', { class: `pr-count${c.hechas === c.total ? ' is-all' : ''}` }, `${c.hechas}/${c.total}`) : null));
        })) : null,
        idle.length ? h('p', { class: 'pr-muted pr-idle' }, `Sin planificar: ${idle.map(areaShort).join(', ')}`) : (!rows.length ? h('p', { class: 'pr-muted pr-day-note' }, 'Sin clases') : null));
    }));
  }

  // ---------- Pintado ----------
  function head() {
    return h('header', { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, `Curso ${currentSchoolYear()}`), h('h1', { class: 'page-title' }, 'Planificación')),
      viewTabs('programacion', { grupo: groupFilter }));
  }

  function emptyNoSchedule() {
    return h('div', { class: 'card' }, h('div', { class: 'empty pl-empty' }, icon('calendario', 44),
      h('strong', {}, 'Aún no hay horario'),
      'La programación se apoya en el horario de clases de tus grupos.',
      h('div', { class: 'pl-empty-actions' }, h('a', { class: 'btn btn-primary', href: '#/calendario?vista=horario' }, 'Crear horario'))));
  }

  function paint() {
    const keep = container.querySelector('.pr-scroll');
    const scrollLeft = keep ? keep.scrollLeft : 0;
    const groups = teacherGroups();
    if (groupFilter && !groups.some((g) => g.id === groupFilter)) groupFilter = '';
    const parts = [head()];
    if (!groups.length) { container.replaceChildren(...parts, emptyNoSchedule()); return; }

    const data = readData();
    const multi = !groupFilter && groups.length > 1;
    const ctx = { data, multi, sitTitle: sitTitleOf(data) };
    const phone = mq.matches;

    const groupSel = groups.length > 1 ? h('select', { class: 'select pr-group', 'aria-label': 'Grupo', onchange: (e) => { groupFilter = e.target.value; nav({ grupo: groupFilter }); } },
      h('option', { value: '', selected: !groupFilter }, 'Todos los grupos'),
      groups.map((g) => h('option', { value: g.id, selected: g.id === groupFilter }, g.nombre))) : null;

    let body, model = null;
    if (modo === 'semana') {
      model = weekModel(data, monday, groupFilter);
      const isNow = today >= monday && today <= addDaysISO(monday, 6);
      parts.push(h('div', { class: 'pr-bar' }, segmentedModo(), navigator(), h('span', { class: 'pr-bar-sp' }), groupSel, printBtn(model, ctx, groups)),
        strip(isNow ? 'Esta semana' : `Semana del ${weekRange(monday)}`, model.stats));
      body = model.rows.length ? (phone ? weekAgenda(model, ctx) : weekGrid(model, ctx))
        : h('div', { class: 'card' }, h('div', { class: 'empty pl-empty' }, icon('calendario', 40), h('strong', {}, 'Sin clases en el horario'), 'Este grupo no tiene franjas en el horario.'));
    } else {
      const mm = monthModel(data, first, groupFilter, today);
      const isNow = firstOfMonth(today) === first;
      parts.push(h('div', { class: 'pr-bar' }, segmentedModo(), navigator(), h('span', { class: 'pr-bar-sp' }), groupSel),
        strip(isNow ? 'Este mes' : cap(monthLabel(first).split(' ')[0]), mm.stats));
      body = mm.areas.length ? (phone ? monthCards(mm, ctx) : monthTable(mm, ctx))
        : h('div', { class: 'card' }, h('div', { class: 'empty pl-empty' }, icon('calendario', 40), h('strong', {}, 'Sin clases en el horario'), 'Este grupo no tiene clases en el horario.'));
    }
    parts.push(body);
    container.replaceChildren(...parts);
    const sc = container.querySelector('.pr-scroll');
    if (sc && scrollLeft) sc.scrollLeft = scrollLeft;
  }

  // Cambios en los datos o en el ancho: repintado agrupado
  let queued = false;
  const requestPaint = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; paint(); });
  };
  paint();
  const unsubs = ['sesiones', 'situaciones', 'schedule', 'events', 'groups'].map((c) => store.subscribe(c, requestPaint));
  mq.addEventListener('change', requestPaint);
  return () => {
    unsubs.forEach((u) => u());
    mq.removeEventListener('change', requestPaint);
    container.classList.remove('plan-view', 'pr-view');
  };
}
