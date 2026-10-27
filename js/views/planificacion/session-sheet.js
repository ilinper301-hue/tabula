// Tabula · Planificación · hoja de una sesión (importable desde Hoy, Calendario, etc.)
//
//   import { openSessionSheet } from './planificacion/session-sheet.js';
//   openSessionSheet(sessionId);
//
// Sin efectos al importar: todo ocurre al llamar a openSessionSheet.
import { store } from '../../store.js';
import { h, icon, openSheet, toast, todayISO, fromISO } from '../../ui.js';
import { areaShort, areaColor, getGroup } from '../../school.js';
import { slotsFor, hasSlots, isLectivo } from '../../planning.js';
import { docsField } from '../documentos/attach.js';
import {
  ctxFor, sesionesOfSit, whenText, slotTime, shortDate, plural, postponeSession, fixSessionDate, applyChanges,
  debounced, field, href, ico, ESTADOS_SES, ESTADO_SES_CLASS,
} from './model.js';

export function openSessionSheet(sessionId) {
  const first = store.get('sesiones', sessionId);
  if (!first) { toast('Esa sesión ya no existe'); return null; }

  const get = () => store.get('sesiones', sessionId);
  const sit = () => store.get('situaciones', first.situacionId);

  // ---------- Campos de texto con autoguardado ----------
  const saved = h('span', { class: 'pl-saved', role: 'status', 'aria-live': 'polite' });
  let savedTimer;
  const flash = () => {
    saved.textContent = 'Guardado';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { saved.textContent = ''; }, 1600);
  };
  const flushers = [];
  function textField(key, label, { rows = 3, placeholder = '', cls = '' } = {}) {
    const ta = h('textarea', { class: `textarea pl-ta ${cls}`, rows, placeholder, value: first[key] || '', 'data-k': key });
    const save = debounced(() => { if (get() && (get()[key] || '') !== ta.value) { store.update('sesiones', sessionId, { [key]: ta.value }); flash(); } }, 500);
    ta.addEventListener('input', save);
    ta.addEventListener('blur', () => save.flush());
    flushers.push(() => save.flush());
    return field(label, ta);
  }
  const titleInput = h('input', { class: 'input', type: 'text', value: first.titulo || '', placeholder: 'Título de la sesión' });
  const saveTitle = debounced(() => {
    const v = titleInput.value.trim();
    if (get() && v && v !== get().titulo) { store.update('sesiones', sessionId, { titulo: v }); flash(); }
  }, 500);
  titleInput.addEventListener('input', saveTitle);
  titleInput.addEventListener('blur', () => saveTitle.flush());
  flushers.push(() => saveTitle.flush());

  // ---------- Parte dinámica: situación, fecha, estado ----------
  const meta = h('div', { class: 'pl-ss-meta' });
  const stateBox = h('div', { class: 'pl-ss-state' });
  const fixBox = h('div', { class: 'pl-fix' });

  function paintMeta() {
    const s = get();
    if (!s) return;
    const g = getGroup(s.groupId);
    const st = sit();
    const ctx = ctxFor(s.groupId, s.area);
    const slot = ctx.schedule.find((x) => x.id === s.scheduleId);
    meta.replaceChildren(
      h('div', { class: 'pl-ss-chips' },
        h('span', { class: `chip ${areaColor(s.area)}` }, `${g ? g.nombre + ' · ' : ''}${areaShort(s.area)}`),
        st ? h('span', { class: 'pl-ss-sit', title: 'Situación de aprendizaje' }, st.titulo) : null,
        h('span', { class: `chip ${ESTADO_SES_CLASS[s.estado] || 't5'}` }, ESTADOS_SES[s.estado] || s.estado)),
      h('div', { class: 'pl-ss-when' },
        icon('calendario', 18),
        h('div', {},
          h('strong', {}, s.fecha ? whenText({ ...s, scheduleId: null }, ctx.schedule, { long: true }) : 'Sin fecha'),
          s.fecha && slot ? h('span', { class: 'pl-sub' }, `Franja de ${slotTime(slot)}${slot.aula ? ` · ${slot.aula}` : ''}`) : null,
          s.fecha && !slot ? h('span', { class: 'pl-sub' }, 'Sin franja del horario') : null),
        s.fija ? h('span', { class: 'chip t5 pl-pinned', title: 'Fecha fijada a mano: el reajuste automático no la mueve' }, ico('pin', 13), 'Fecha fija') : null));

    const hecha = s.estado === 'hecha';
    const canPostpone = !!s.fecha && !hecha && hasSlots(ctx);
    stateBox.replaceChildren(
      h('button', {
        type: 'button', class: `btn ${hecha ? '' : 'btn-primary'} pl-state-btn`, 'aria-pressed': String(hecha),
        onclick: () => {
          const prev = get().estado;
          store.update('sesiones', sessionId, { estado: hecha ? 'pendiente' : 'hecha' });
          if (!hecha) toast('Sesión marcada como hecha', { label: 'Deshacer', run: () => store.update('sesiones', sessionId, { estado: prev }) });
        },
      }, icon('check', 16), hecha ? 'Hecha · volver a pendiente' : 'Hecha'),
      h('button', {
        type: 'button', class: 'btn pl-state-btn', disabled: !canPostpone,
        title: canPostpone ? null : (hecha ? 'Una sesión hecha no se aplaza' : 'Necesita fecha y horario del área'),
        onclick: () => {
          const { changes, undo } = postponeSession(sessionId);
          toast(`Sesión aplazada; ${plural(changes.length, 'sesión reajustada', 'sesiones reajustadas')}`, { label: 'Deshacer', run: undo });
        },
      }, icon('chevronRight', 16), 'No se pudo dar → aplazar'));
  }

  // ---------- Fijar fecha ----------
  const dateInput = h('input', { class: 'input', type: 'date', value: first.fecha || todayISO(), 'aria-label': 'Fecha' });
  const slotSelect = h('select', { class: 'select', 'aria-label': 'Franja del horario' });
  const fixNote = h('p', { class: 'pl-hint pl-fix-note' });

  function paintSlots() {
    const s = get();
    if (!s || !dateInput.value) { slotSelect.replaceChildren(); return; }
    const ctx = ctxFor(s.groupId, s.area);
    const wd = fromISO(dateInput.value).getDay();
    const slots = slotsFor(ctx.schedule, s.groupId, s.area).filter((x) => x.dia === wd);
    const others = store.list('sesiones').filter((x) => x.id !== s.id && x.groupId === s.groupId && x.area === s.area && x.fecha === dateInput.value);
    slotSelect.replaceChildren(...(slots.length
      ? slots.map((x) => {
        const busy = others.some((o) => o.scheduleId === x.id);
        return h('option', { value: x.id, selected: x.id === s.scheduleId }, `${slotTime(x)}${busy ? ' (ocupada)' : ''}`);
      })
      : [h('option', { value: '' }, 'Sin franja ese día')]));
    const notes = [];
    if (!isLectivo(dateInput.value, ctx.events)) notes.push('Ese día no es lectivo.');
    else if (!slots.length) notes.push(`Ese día no hay clase de ${areaShort(s.area)} en el horario.`);
    fixNote.textContent = notes.join(' ');
  }
  dateInput.addEventListener('change', paintSlots);

  function paintFix() {
    const s = get();
    if (!s) return;
    fixBox.replaceChildren(
      h('div', { class: 'pl-fix-row' },
        h('div', { class: 'pl-fix-date' }, dateInput), h('div', { class: 'pl-fix-slot' }, slotSelect),
        h('button', {
          type: 'button', class: 'btn', onclick: () => {
            if (!dateInput.value) return;
            const { moved, undo } = fixSessionDate(sessionId, dateInput.value, slotSelect.value || null);
            toast(`Fecha fijada: ${shortDate(dateInput.value)}${moved ? `; ${plural(moved, 'sesión reajustada', 'sesiones reajustadas')}` : ''}`, { label: 'Deshacer', run: undo });
          },
        }, icon('check', 16), 'Fijar')),
      fixNote,
      s.fecha ? h('button', {
        type: 'button', class: 'link-btn', onclick: () => {
          const undo = applyChanges([{ id: sessionId, fecha: null, scheduleId: null }], { [sessionId]: { fija: false } });
          toast('Fecha quitada', { label: 'Deshacer', run: undo });
        },
      }, 'Quitar fecha') : null);
    paintSlots();
  }

  // ---------- Montaje ----------
  const docs = docsField(sessionId);
  const body = h('div', { class: 'pl-ss' },
    meta,
    field('Título', titleInput),
    stateBox,
    first.groupId ? h('button', {
      type: 'button', class: 'btn pl-state-btn pl-ss-observe', style: { width: '100%', marginBottom: '16px' },
      onclick: () => import('../anecdotario.js').then((m) => m.openQuickObservation({ groupId: first.groupId, area: first.area || null, sesionId: sessionId })),
    }, icon('note', 16), 'Registrar observación') : null,
    textField('objetivo', 'Objetivo', { rows: 2, placeholder: '¿Qué deben aprender hoy?' }),
    textField('desarrollo', 'Desarrollo', { rows: 5, placeholder: 'Actividades, agrupamientos, tiempos…' }),
    textField('materiales', 'Materiales', { rows: 2, placeholder: 'Libro, fichas, proyector…' }),
    docs.el,
    h('div', { class: 'pl-diary' }, textField('diario', 'Diario de clase', { rows: 4, placeholder: '¿Qué pasó realmente?' })),
    h('section', { class: 'pl-ss-block' }, h('h3', { class: 'section-label' }, 'Fijar fecha'), fixBox),
    h('div', { class: 'pl-ss-foot' },
      saved,
      h('a', {
        class: 'btn btn-ghost', href: href({ grupo: first.groupId, area: first.area, sit: first.situacionId }),
        onclick: () => close(),
      }, ico('link', 16), 'Abrir en Planificación')));

  paintMeta(); paintFix();
  // Si la sesión cambia desde fuera (aplazar, reajustes), se refresca solo la parte dinámica
  const unsub = [store.subscribe('sesiones', () => {
    if (!get()) { close(); return; }
    const active = body.contains(document.activeElement) && ['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName);
    paintMeta();
    if (!(active && fixBox.contains(document.activeElement))) paintFix();
  }), store.subscribe('situaciones', paintMeta), store.subscribe('schedule', () => { paintMeta(); paintSlots(); })];

  const pos = sesionesOfSit(first.situacionId).findIndex((x) => x.id === sessionId) + 1;
  const close = openSheet(pos ? `Sesión ${pos}` : 'Sesión', body, {
    onClose: () => { flushers.forEach((f) => f()); unsub.forEach((u) => u()); docs.destroy(); },
  });
  return close;
}
