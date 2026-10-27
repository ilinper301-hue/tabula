// Tabula · vista «Planificación» (situaciones de aprendizaje y reparto de sesiones en el horario)
//
// Ruta: #/planificacion?grupo=<groupId>&area=<área>&sit=<situacionId>
// Módulos auxiliares en ./planificacion/ :
//   model.js          datos, aplicar cambios del motor con «Deshacer», utilidades
//   overview.js       vista general (sesiones vencidas, próximas, líneas de tiempo, tarjetas)
//   timeline.js       franja de semanas de la evaluación
//   detail.js         detalle de una situación (cabecera, criterios, sesiones)
//   sheets.js         hojas: nueva situación, programar, añadir varias, elegir área
//   session-sheet.js  hoja de una sesión (exporta openSessionSheet, reutilizable por Hoy y Calendario)
import { store } from '../store.js';
import { h, icon } from '../ui.js';
import { getGroups, getGroup, AREAS, areaShort, areaColor, currentSchoolYear } from '../school.js';
import { hasSlots } from '../planning.js';
import {
  ctxFor, situacionesOf, sesionesOf, areasWithSituaciones, href,
} from './planificacion/model.js';
import { renderOverview } from './planificacion/overview.js';
import { renderDetail } from './planificacion/detail.js';
import { openNewSituacionSheet, openAreaPicker } from './planificacion/sheets.js';

export { openSessionSheet } from './planificacion/session-sheet.js';

// Lo último que eligió el docente, para volver al mismo sitio desde otras secciones.
const last = { groupId: null, area: null };

export function render(container, params = new URLSearchParams()) {
  container.classList.add('plan-view');
  const st = { groupId: null, area: null, sitId: null };

  function resolveSelection() {
    const groups = getGroups();
    // Una situación indicada en la URL manda sobre grupo y área
    const sit = params.get('sit') ? store.get('situaciones', params.get('sit')) : null;
    const wanted = (sit && sit.groupId) || params.get('grupo') || last.groupId;
    const g = groups.find((x) => x.id === st.groupId && !sit) || groups.find((x) => x.id === wanted)
      || groups.find((x) => x.tutoria) || groups[0] || null;
    st.groupId = g ? g.id : null;
    if (!g) return;
    const withSit = areasWithSituaciones(g.id);
    const a = (sit && sit.groupId === g.id && sit.area) || params.get('area');
    st.area = (a && AREAS.includes(a) ? a : null) || (last.groupId === g.id && last.area) || withSit.find((x) => AREAS.includes(x)) || AREAS[0];
    st.sitId = sit && sit.groupId === g.id && sit.area === st.area ? sit.id : null;
    Object.assign(last, { groupId: g.id, area: st.area });
  }

  const sel = () => ({ grupo: st.groupId, area: st.area, sit: st.sitId });
  const go = (patch) => { location.hash = href({ ...sel(), ...patch }).slice(1); };

  // ---------- Pintado ----------
  function pageHead(group) {
    return h('header', { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, group ? `${group.nombre} · ${areaShort(st.area)} · curso ${group.cursoEscolar || currentSchoolYear()}` : `Curso ${currentSchoolYear()}`),
        h('h1', { class: 'page-title' }, 'Planificación')),
      group ? h('button', { type: 'button', class: 'btn btn-primary pl-new', onclick: newSituacion },
        icon('plus', 16), h('span', {}, 'Nueva situación de aprendizaje')) : null);
  }

  function newSituacion() {
    openNewSituacionSheet({ groupId: st.groupId, area: st.area, onCreated: (sit) => go({ sit: sit.id }) });
  }

  function toolbar(groups) {
    const groupSel = h('select', { class: 'select pl-group', 'aria-label': 'Grupo', onchange: (e) => go({ grupo: e.target.value, area: null, sit: null }) },
      groups.map((g) => h('option', { value: g.id, selected: g.id === st.groupId }, g.nombre)));
    const withSit = areasWithSituaciones(st.groupId).filter((a) => AREAS.includes(a))
      .sort((a, b) => AREAS.indexOf(a) - AREAS.indexOf(b));
    const shown = [...withSit, ...(withSit.includes(st.area) ? [] : [st.area])];
    const areaChips = h('div', { class: 'pl-areas', role: 'group', 'aria-label': 'Área' },
      shown.map((a) => h('button', {
        type: 'button', class: `pl-area ${areaColor(a)}`, 'aria-pressed': String(a === st.area), title: a,
        onclick: () => go({ area: a, sit: null }),
      }, areaShort(a))),
      AREAS.length > shown.length ? h('button', { type: 'button', class: 'pl-area pl-area-add', onclick: () => openAreaPicker({ exclude: shown, onPick: (a) => go({ area: a, sit: null }) }) }, icon('plus', 14), 'Área') : null);
    return h('div', { class: 'pl-toolbar' }, groupSel, areaChips);
  }

  function noSlotsNotice() {
    return h('div', { class: 'pl-notice', role: 'status' },
      h('span', {}, h('strong', {}, `Este grupo no tiene sesiones de ${areaShort(st.area)} en el horario. `),
        'Puedes planificar igualmente; las sesiones quedarán sin fecha hasta que lo añadas.'),
      h('a', { class: 'btn btn-sm', href: '#/calendario?vista=horario' }, 'Ir al horario'));
  }

  function emptyNoGroups() {
    return h('div', { class: 'card' }, h('div', { class: 'empty pl-empty' }, icon('grupos', 44),
      h('strong', {}, 'Primero crea un grupo'),
      'La planificación necesita un grupo para repartir sus sesiones en el horario.',
      h('div', { class: 'pl-empty-actions' }, h('a', { class: 'btn btn-primary', href: '#/grupos' }, 'Ir a Grupos'))));
  }

  let tlScroll = null;
  function paint() {
    const focus = captureFocus(container);
    const keepScroll = container.querySelector('.pl-tl-scroll');
    if (keepScroll) tlScroll = keepScroll.scrollLeft;
    resolveSelection();
    const groups = getGroups();
    if (!groups.length) { container.replaceChildren(pageHead(null), emptyNoGroups()); return; }
    const group = getGroup(st.groupId);
    const ctx = ctxFor(st.groupId, st.area);
    const sits = situacionesOf(st.groupId, st.area);
    const sesiones = sesionesOf(st.groupId, st.area);
    const parts = [pageHead(group), toolbar(groups)];
    if (!hasSlots(ctx)) parts.push(noSlotsNotice());
    const env = {
      groupId: st.groupId, area: st.area, sits, sesiones, schedule: ctx.schedule, go, newSituacion, repaint: paint, prevTlScroll: tlScroll,
    };
    const sit = st.sitId ? sits.find((x) => x.id === st.sitId) : null;
    if (st.sitId && !sit) { // la situación ya no existe: volvemos a la vista general
      st.sitId = null; params = new URLSearchParams({ grupo: st.groupId, area: st.area });
    }
    parts.push(...(sit ? renderDetail({ ...env, sit }) : renderOverview(env)));
    container.replaceChildren(...parts.filter(Boolean).flat());
    restoreFocus(container, focus);
  }

  // Cambios en los datos: repintado agrupado (varias escrituras seguidas = un solo pintado)
  let queued = false;
  const requestPaint = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; paint(); });
  };

  paint();
  const unsubs = ['situaciones', 'sesiones', 'schedule', 'events', 'gradebooks', 'groups'].map((c) => store.subscribe(c, requestPaint));
  return () => {
    unsubs.forEach((u) => u());
    container.classList.remove('plan-view');
  };
}

// ---------- Conservar el foco al repintar ----------
// Los campos que se están escribiendo llevan data-k; se restauran con su texto y cursor.
function captureFocus(root) {
  const el = document.activeElement;
  if (!el || !root.contains(el) || !el.dataset || !el.dataset.k) return null;
  const isText = el.tagName === 'INPUT' && el.type !== 'checkbox' || el.tagName === 'TEXTAREA';
  return {
    k: el.dataset.k, value: isText ? el.value : null,
    start: isText ? el.selectionStart : null, end: isText ? el.selectionEnd : null, scroll: el.scrollTop,
  };
}
function restoreFocus(root, f) {
  if (!f) return;
  const el = [...root.querySelectorAll('[data-k]')].find((x) => x.dataset.k === f.k);
  if (!el) return;
  if (f.value !== null) {
    el.value = f.value;
    try { el.setSelectionRange(f.start, f.end); } catch { /* tipos sin selección */ }
  }
  el.focus({ preventScroll: true });
  el.scrollTop = f.scroll;
}
