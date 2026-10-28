// Tabula · página del asistente (asistente.html#<llave>)
// Sesión anónima + dispositivo aprobado por el docente. Solo puede AÑADIR apuntes a la bandeja
// y leer una lista mínima (nombres del alumnado, pendientes y horas de eventos).

import { h, icon, logoMark, toast, todayISO, relativeDay, addDaysISO, MESES, fromISO } from './ui.js';
import { readKey, forgetKey, connect } from './asistente-client.js';
import { matchStudents, overlaps } from './asistente-model.js';

const root = document.getElementById('as-root');
const MODALIDADES = [['presencial', 'Presencial'], ['telefono', 'Telefónica'], ['video', 'Videollamada']];
const TIPOS_OBS = [['positiva', 'Positiva'], ['negativa', 'A mejorar'], ['neutra', 'Neutra']];

let session = null;
let lectura = null;
let deviceName = '';
let lastStatus = null;
let wasApproved = false;
let stopStatus = null;
let stopLectura = null;
const lecturaListeners = new Set();

// ---------- Estructura común ----------
const header = () => h('header', { class: 'as-head' },
  logoMark(34),
  h('div', { class: 'as-head-text' },
    h('h1', { class: 'as-title' }, 'Tabula · Apuntes para el docente'),
    h('p', { class: 'as-sub' }, 'Añade tareas, eventos, observaciones y tutorías a su bandeja.')));

function show(...nodes) {
  root.replaceChildren(header(), ...nodes.filter(Boolean));
}

function message({ title, text, actions = [], tone = '', ic = 'lock' }) {
  show(h('section', { class: `card as-msg ${tone}`, 'aria-live': 'polite' },
    h('span', { class: 'as-msg-ico', 'aria-hidden': 'true' }, icon(ic, 26)),
    h('h2', { class: 'as-msg-title', id: 'as-msg-title' }, title),
    text ? h('p', { class: 'as-msg-text' }, text) : null,
    actions.length ? h('div', { class: 'as-msg-actions' }, ...actions) : null));
}

const forgetBtn = (label = 'Olvidar este acceso en este dispositivo') => h('button', {
  type: 'button', class: 'btn btn-ghost', id: 'as-olvidar',
  onclick: () => { forgetKey(); location.href = location.pathname; },
}, label);

// ---------- Pantallas ----------
function screenAskName(note = '') {
  const input = h('input', {
    class: 'input', id: 'as-dispositivo', name: 'dispositivo', type: 'text', maxlength: '40', autocomplete: 'off',
    placeholder: 'Ej. Móvil de Ana, Asistente IA', 'aria-describedby': 'as-dispositivo-ayuda', required: true, value: deviceName,
  });
  const err = h('p', { class: 'as-error', role: 'alert', hidden: true });
  const btn = h('button', { type: 'submit', class: 'btn btn-primary as-wide', id: 'as-pedir' }, 'Pedir acceso');
  const form = h('form', { class: 'card as-card', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    err.hidden = true;
    if (!name) { err.textContent = 'Escribe un nombre para este dispositivo.'; err.hidden = false; input.focus(); return; }
    btn.disabled = true; btn.textContent = 'Enviando…';
    try { deviceName = name; await session.requestAccess(name); route('pendiente'); }
    catch { err.textContent = 'No se pudo enviar la petición. Revisa la conexión e inténtalo de nuevo.'; err.hidden = false; btn.disabled = false; btn.textContent = 'Pedir acceso'; }
  } },
    h('h2', { class: 'as-card-title' }, 'Pedir acceso'),
    note ? h('p', { class: 'as-note' }, note) : null,
    h('p', { class: 'as-text' }, 'El docente tiene que aprobar cada dispositivo antes de que puedas añadir apuntes.'),
    h('div', { class: 'field' },
      h('label', { for: 'as-dispositivo' }, '¿Cómo se llama este dispositivo?'),
      input,
      h('p', { class: 'as-hint', id: 'as-dispositivo-ayuda' }, 'Así sabrá el docente quién lo pide.')),
    err, btn);
  show(form, h('div', { class: 'as-foot' }, forgetBtn()));
  input.focus();
}

function screenWaiting() {
  show(h('section', { class: 'card as-msg as-wait', 'aria-live': 'polite' },
    h('span', { class: 'as-pulse', 'aria-hidden': 'true' }),
    h('h2', { class: 'as-msg-title', id: 'as-esperando' }, 'Esperando a que el docente apruebe este dispositivo'),
    h('p', { class: 'as-msg-text' }, 'Puedes dejar esta página abierta: continuará sola en cuanto lo apruebe.'),
    deviceName ? h('p', { class: 'as-device' }, icon('lock', 14), deviceName) : null),
  h('div', { class: 'as-foot' }, forgetBtn()));
}

function route(status) {
  lastStatus = status;
  lecturaListeners.clear();
  if (status === 'aprobado') { wasApproved = true; return screenMain(); }
  if (status === 'pendiente') return screenWaiting();
  if (status === 'sin-pedir') {
    return screenAskName(wasApproved ? 'El docente ha retirado este dispositivo. Si quieres, pide acceso de nuevo.' : '');
  }
  if (status === 'invalida') {
    if (stopStatus) { stopStatus(); stopStatus = null; }
    if (stopLectura) { stopLectura(); stopLectura = null; }
    return message({
      title: 'El acceso está desactivado o ha caducado',
      text: 'Pide un enlace nuevo al docente.', ic: 'lock', tone: 'as-msg-warn',
      actions: [forgetBtn('Olvidar este acceso')],
    });
  }
}

// ---------- Pantalla principal ----------
const fmtDate = (iso) => { const d = fromISO(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
const fmtStamp = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

const field = (id, label, control, { req = false, hint = '' } = {}) => h('div', { class: 'field' },
  h('label', { for: id }, label, req ? h('span', { class: 'as-req', 'aria-hidden': 'true' }, ' *') : null, req ? h('span', { class: 'sr-only' }, ' (obligatorio)') : null),
  control,
  hint ? h('p', { class: 'as-hint', id: `${id}-ayuda` }, hint) : null);
const input = (id, type = 'text', extra = {}) => h('input', { class: 'input', id, name: id, type, autocomplete: 'off', ...extra });
const textarea = (id, extra = {}) => h('textarea', { class: 'textarea', id, name: id, rows: '3', ...extra });

/** Selector de alumnado: escribe un nombre y elige de la lista (uno o varios). */
function picker({ id, multi = false, max = 6 }) {
  let explicit = null;     // alumno elegido en modo individual
  let chosen = [];         // alumnos elegidos en modo múltiple
  const box = h('input', {
    class: 'input', id, name: id, type: 'text', autocomplete: 'off', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false',
    'aria-controls': `${id}-lista`, 'aria-describedby': `${id}-ayuda`, placeholder: multi ? 'Escribe un nombre y elígelo de la lista' : 'Escribe un nombre',
  });
  const list = h('ul', { class: 'as-results', id: `${id}-lista`, role: 'listbox', 'aria-label': 'Alumnado encontrado', hidden: true });
  const chips = h('div', { class: 'as-chosen', id: `${id}-elegidos`, 'aria-label': 'Alumnado elegido' });
  const hint = h('p', { class: 'as-pick-hint', id: `${id}-ayuda`, role: 'status', 'aria-live': 'polite' });
  const full = (m) => [m.nombre, m.apellidos].filter(Boolean).join(' ');

  const matches = () => {
    const taken = new Set(chosen.map((c) => c.id));
    return matchStudents(lectura?.grupos || [], box.value).filter((m) => !taken.has(m.id));
  };
  const current = () => {
    if (multi) return null;
    if (explicit) return explicit;
    const m = matches();
    return m.length === 1 ? m[0] : null;
  };

  function paint() {
    const text = box.value.trim();
    const ms = text ? matches() : [];
    const single = current();
    const showList = !!text && !explicit && ms.length > 0 && (!multi || chosen.length < max);
    list.hidden = !showList;
    box.setAttribute('aria-expanded', String(showList));
    list.replaceChildren(...ms.slice(0, 8).map((m) => h('li', { role: 'presentation' },
      h('button', {
        type: 'button', class: 'as-result', role: 'option', 'aria-selected': String(!multi && single?.id === m.id), dataset: { id: m.id },
        onclick: () => choose(m),
      }, h('span', { class: 'as-result-name' }, full(m)), h('span', { class: 'as-result-group' }, m.grupo)))));

    chips.replaceChildren(...chosen.map((c) => h('span', { class: 'as-chip' },
      h('span', {}, `${full(c)} · ${c.grupo}`),
      h('button', { type: 'button', class: 'as-chip-x', 'aria-label': `Quitar a ${full(c)}`, onclick: () => { chosen = chosen.filter((x) => x.id !== c.id); paint(); box.focus(); } }, icon('x', 14)))));
    box.disabled = multi && chosen.length >= max;

    let msg = '', warn = false;
    if (multi && chosen.length >= max) msg = `Máximo ${max} alumnos o alumnas.`;
    else if (!lectura && text) { msg = 'Aún no hay lista del alumnado: se enviará solo con el nombre.'; warn = true; }
    else if (!text) msg = multi ? (chosen.length ? '' : 'Escribe un nombre y elígelo de la lista.') : 'Escribe un nombre y elígelo de la lista.';
    else if (explicit) msg = `Asignado a ${full(explicit)} · ${explicit.grupo}.`;
    else if (ms.length === 0) { msg = chosen.length && multi ? '' : 'No encontramos ese nombre. Se enviará sin asignar; el docente lo asignará.'; warn = !multi || !chosen.length; }
    else if (ms.length > 1) {
      const names = new Set(ms.map((m) => m.nombre));
      const who = names.size === 1 ? [...names][0] : text;
      msg = `Hay ${ms.length} alumnos llamados ${who}: elige uno`; warn = true;
    } else if (!multi) msg = `Se asignará a ${full(ms[0])} · ${ms[0].grupo}.`;
    else msg = 'Elígelo de la lista para añadirlo.';
    hint.textContent = msg;
    hint.classList.toggle('is-warn', warn);
  }
  function choose(m) {
    if (multi) { if (chosen.length < max) chosen.push(m); box.value = ''; paint(); box.focus(); }
    else { explicit = m; box.value = full(m); paint(); }
  }
  box.addEventListener('input', () => { explicit = null; paint(); });
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || list.hidden) return;
    const first = list.querySelector('.as-result');
    if (first && (multi || matches().length === 1)) { e.preventDefault(); first.click(); }
  });
  lecturaListeners.add(paint);
  paint();

  return {
    el: h('div', { class: 'as-picker' }, chips, box, list, hint),
    box,
    typed: () => box.value.trim(),
    /** { ids: [...], groupId, texto } */
    value() {
      if (multi) {
        const texto = box.value.trim() || chosen.map(full).join(', ');
        return { ids: chosen.map((c) => c.id), groupId: chosen[0]?.groupId || null, texto };
      }
      const s = current();
      return { ids: s ? [s.id] : [], groupId: s ? s.groupId : null, texto: box.value.trim() };
    },
    reset() { explicit = null; chosen = []; box.value = ''; paint(); },
  };
}

function screenMain() {
  const tabs = [['tarea', 'Tarea'], ['evento', 'Evento'], ['observacion', 'Observación'], ['reunion', 'Tutoría']];
  let active = 'tarea';
  const status = h('p', { class: 'as-status', id: 'as-estado', role: 'status', 'aria-live': 'polite' });
  const setStatus = (t, ok = true) => { status.textContent = t; status.classList.toggle('is-ok', ok && !!t); };

  // ---- formularios ----
  function formShell(tipo, title, fields, build, reset, buttonLabel) {
    const err = h('p', { class: 'as-error', id: `${tipo}-error`, role: 'alert', hidden: true });
    const btn = h('button', { type: 'submit', class: 'btn btn-primary as-send', id: `${tipo}-enviar` }, icon('check', 18), buttonLabel);
    const fail = (m, el) => { err.textContent = m; err.hidden = false; if (el) el.focus(); };
    const form = h('form', {
      class: 'card as-card as-form', id: `form-${tipo}`, role: 'tabpanel', 'aria-labelledby': `tab-${tipo}`, novalidate: true, hidden: tipo !== active,
      onsubmit: async (e) => {
        e.preventDefault();
        err.hidden = true; setStatus('');
        const r = build();
        if (r.error) return fail(r.error, r.focus);
        btn.disabled = true; btn.lastChild.textContent = 'Enviando…';
        try {
          await session.send(tipo, r.datos);
          reset();
          setStatus('Enviado a la bandeja del docente.');
          toast('Enviado a la bandeja del docente');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (x) { fail(x.message || 'No se pudo enviar. Inténtalo de nuevo.'); }
        finally { btn.disabled = false; btn.lastChild.textContent = buttonLabel; }
      },
    }, h('h2', { class: 'as-card-title' }, title), ...fields, err, btn);
    return form;
  }

  // Tarea
  const t = { titulo: input('tarea-titulo', 'text', { maxlength: '200', 'aria-required': 'true', placeholder: 'Ej. Llamar a la familia de…' }), fecha: input('tarea-fecha', 'date'), hora: input('tarea-hora', 'time'), notas: textarea('tarea-notas', { maxlength: '1000' }) };
  const fTarea = formShell('tarea', 'Nueva tarea', [
    field('tarea-titulo', 'Título', t.titulo, { req: true }),
    h('div', { class: 'as-two' }, field('tarea-fecha', 'Fecha', t.fecha), field('tarea-hora', 'Hora', t.hora)),
    field('tarea-notas', 'Notas', t.notas),
  ], () => {
    if (!t.titulo.value.trim()) return { error: 'Escribe un título para la tarea.', focus: t.titulo };
    return { datos: { titulo: t.titulo.value.trim(), fecha: t.fecha.value, hora: t.hora.value, notas: t.notas.value.trim() } };
  }, () => { [t.titulo, t.fecha, t.hora, t.notas].forEach((x) => { x.value = ''; }); }, 'Enviar tarea');

  // Evento
  const ev = { titulo: input('evento-titulo', 'text', { maxlength: '200', 'aria-required': 'true', placeholder: 'Ej. Reunión de ciclo' }), fecha: input('evento-fecha', 'date', { 'aria-required': 'true' }), hora: input('evento-hora', 'time'), fin: input('evento-hora-fin', 'time'), notas: textarea('evento-notas', { maxlength: '1000' }) };
  const clash = h('p', { class: 'as-warn', id: 'evento-aviso', role: 'status', 'aria-live': 'polite', hidden: true });
  const paintClash = () => {
    const c = overlaps(lectura?.eventos, ev.fecha.value, ev.hora.value);
    clash.hidden = !c.length;
    clash.replaceChildren(...(c.length ? [icon('clock', 15), `Coincide con: ${c.map((e) => `${e.titulo} (${e.hora})`).join(', ')}`] : []));
  };
  [ev.fecha, ev.hora].forEach((x) => x.addEventListener('input', paintClash));
  const fEvento = formShell('evento', 'Nuevo evento', [
    field('evento-titulo', 'Título', ev.titulo, { req: true }),
    field('evento-fecha', 'Fecha', ev.fecha, { req: true }),
    h('div', { class: 'as-two' }, field('evento-hora', 'Hora', ev.hora), field('evento-hora-fin', 'Hora de fin', ev.fin)),
    clash,
    field('evento-notas', 'Notas', ev.notas),
  ], () => {
    if (!ev.titulo.value.trim()) return { error: 'Escribe un título para el evento.', focus: ev.titulo };
    if (!ev.fecha.value) return { error: 'Elige la fecha del evento.', focus: ev.fecha };
    if (ev.hora.value && ev.fin.value && ev.fin.value < ev.hora.value) return { error: 'La hora de fin es anterior a la de inicio.', focus: ev.fin };
    return { datos: { titulo: ev.titulo.value.trim(), fecha: ev.fecha.value, hora: ev.hora.value, horaFin: ev.fin.value, notas: ev.notas.value.trim() } };
  }, () => { [ev.titulo, ev.fecha, ev.hora, ev.fin, ev.notas].forEach((x) => { x.value = ''; }); paintClash(); }, 'Enviar evento');
  lecturaListeners.add(paintClash);

  // Observación
  const ob = { alumno: picker({ id: 'observacion-alumno' }), texto: textarea('observacion-texto', { maxlength: '2000', rows: '4', 'aria-required': 'true', placeholder: 'Qué ha pasado, en pocas palabras' }), fecha: input('observacion-fecha', 'date', { value: todayISO() }) };
  const radios = TIPOS_OBS.map(([val, label], i) => h('label', { class: `as-radio as-radio-${val}`, for: `observacion-tipo-${val}` },
    h('input', { type: 'radio', id: `observacion-tipo-${val}`, name: 'observacion-tipo', value: val, checked: i === 2 }), h('span', {}, label)));
  const obTipo = () => radios.map((r) => r.querySelector('input')).find((x) => x.checked)?.value || 'neutra';
  const fObs = formShell('observacion', 'Nueva observación', [
    field('observacion-alumno', 'Alumno o alumna', ob.alumno.el, { req: true }),
    h('fieldset', { class: 'as-fieldset' }, h('legend', {}, 'Tipo'), h('div', { class: 'as-radios' }, radios)),
    field('observacion-texto', 'Observación', ob.texto, { req: true }),
    field('observacion-fecha', 'Fecha', ob.fecha),
  ], () => {
    const a = ob.alumno.value();
    if (!a.texto && !a.ids.length) return { error: 'Escribe el nombre del alumno o alumna.', focus: ob.alumno.box };
    if (!ob.texto.value.trim()) return { error: 'Escribe la observación.', focus: ob.texto };
    return { datos: { studentId: a.ids[0], groupId: a.groupId, alumnoTexto: a.texto, tipo: obTipo(), texto: ob.texto.value.trim(), fecha: ob.fecha.value } };
  }, () => { ob.alumno.reset(); ob.texto.value = ''; ob.fecha.value = todayISO(); radios[2].querySelector('input').checked = true; }, 'Enviar observación');

  // Tutoría
  const tu = {
    alumnos: picker({ id: 'tutoria-alumno', multi: true }), fecha: input('tutoria-fecha', 'date', { value: todayISO(), 'aria-required': 'true' }), hora: input('tutoria-hora', 'time'),
    modalidad: h('select', { class: 'select', id: 'tutoria-modalidad', name: 'tutoria-modalidad' }, MODALIDADES.map(([v, l]) => h('option', { value: v }, l))),
    asistentes: input('tutoria-asistentes', 'text', { maxlength: '300', placeholder: 'Ej. Madre' }),
    motivo: textarea('tutoria-motivo', { maxlength: '500', rows: '2' }), resumen: textarea('tutoria-resumen', { maxlength: '3000', rows: '4' }),
  };
  let acuerdos = [''];
  const agBox = h('div', { class: 'as-acuerdos', id: 'tutoria-acuerdos' });
  const addAg = h('button', { type: 'button', class: 'btn btn-sm', id: 'tutoria-acuerdo-add', onclick: () => { syncAg(); if (acuerdos.length < 20) acuerdos.push(''); paintAg(true); } }, icon('plus', 15), 'Añadir acuerdo');
  const syncAg = () => { acuerdos = [...agBox.querySelectorAll('input')].map((i) => i.value); };
  function paintAg(focusLast = false) {
    agBox.replaceChildren(...acuerdos.map((v, i) => h('div', { class: 'as-ag-row' },
      h('label', { class: 'sr-only', for: `tutoria-acuerdo-${i + 1}` }, `Acuerdo ${i + 1}`),
      h('input', { class: 'input', id: `tutoria-acuerdo-${i + 1}`, name: 'tutoria-acuerdo', type: 'text', maxlength: '300', autocomplete: 'off', value: v, placeholder: `Acuerdo ${i + 1}` }),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Quitar acuerdo ${i + 1}`, onclick: () => { syncAg(); acuerdos.splice(i, 1); paintAg(); } }, icon('x', 17)))));
    addAg.disabled = acuerdos.length >= 20;
    if (focusLast) agBox.querySelector('.as-ag-row:last-child input')?.focus();
  }
  paintAg();
  const fTut = formShell('reunion', 'Nueva tutoría', [
    field('tutoria-alumno', 'Alumnado', tu.alumnos.el, { req: true }),
    h('div', { class: 'as-two' }, field('tutoria-fecha', 'Fecha', tu.fecha, { req: true }), field('tutoria-hora', 'Hora', tu.hora)),
    h('div', { class: 'as-two' }, field('tutoria-modalidad', 'Modalidad', tu.modalidad), field('tutoria-asistentes', 'Asistentes', tu.asistentes)),
    field('tutoria-motivo', 'Motivo', tu.motivo),
    field('tutoria-resumen', 'Resumen', tu.resumen),
    h('div', { class: 'field' }, h('span', { class: 'field-label', id: 'tutoria-acuerdos-t' }, 'Acuerdos'), agBox, h('div', {}, addAg)),
  ], () => {
    const a = tu.alumnos.value();
    if (!a.texto && !a.ids.length) return { error: 'Escribe el nombre del alumno o alumna.', focus: tu.alumnos.box };
    if (!tu.fecha.value) return { error: 'Elige la fecha de la tutoría.', focus: tu.fecha };
    syncAg();
    const d = { studentIds: a.ids, alumnoTexto: a.texto, fecha: tu.fecha.value, hora: tu.hora.value, modalidad: tu.modalidad.value, asistentes: tu.asistentes.value.trim(), motivo: tu.motivo.value.trim(), resumen: tu.resumen.value.trim(), acuerdos: acuerdos.map((x) => x.trim()).filter(Boolean) };
    if (a.groupId) d.groupId = a.groupId;
    return { datos: d };
  }, () => {
    tu.alumnos.reset(); tu.fecha.value = todayISO(); tu.hora.value = ''; tu.modalidad.value = 'presencial';
    [tu.asistentes, tu.motivo, tu.resumen].forEach((x) => { x.value = ''; }); acuerdos = ['']; paintAg();
  }, 'Enviar tutoría');

  const forms = { tarea: fTarea, evento: fEvento, observacion: fObs, reunion: fTut };

  // ---- pestañas ----
  const tabEls = tabs.map(([k, label]) => h('button', {
    type: 'button', role: 'tab', id: `tab-${k}`, 'aria-selected': String(k === active), 'aria-controls': `form-${k}`, tabindex: k === active ? '0' : '-1',
    onclick: () => select(k),
    onkeydown: (e) => {
      const i = tabs.findIndex(([x]) => x === active);
      const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
      if (j !== null && tabs[j]) { e.preventDefault(); select(tabs[j][0]); tabEls[j].focus(); }
    },
  }, label));
  function select(k) {
    active = k; setStatus('');
    tabs.forEach(([x], i) => { tabEls[i].setAttribute('aria-selected', String(x === k)); tabEls[i].tabIndex = x === k ? 0 : -1; forms[x].hidden = x !== k; });
  }

  // ---- «Para recordar» ----
  const remember = h('details', { class: 'card as-remember', id: 'as-recordar' });
  const wide = matchMedia('(min-width: 900px)');
  remember.open = wide.matches;
  function paintRemember() {
    const today = todayISO(), lim = addDaysISO(today, 14);
    const pend = (lectura?.pendientes || []).slice(0, 25);
    const evs = (lectura?.eventos || []).filter((e) => e.fecha <= lim && (e.fechaFin || e.fecha) >= today).slice(0, 25);
    const item = (main, when, late) => h('li', { class: 'as-rem-item' }, h('span', { class: 'as-rem-main' }, main), when ? h('span', { class: `as-rem-when${late ? ' is-late' : ''}` }, when) : null);
    remember.replaceChildren(
      h('summary', { class: 'as-rem-sum' }, h('span', { class: 'as-card-title' }, 'Para recordar'), icon('chevronDown', 18, 'as-rem-chev')),
      !lectura ? h('p', { class: 'as-text' }, 'El docente aún no ha compartido su lista.') : h('div', { class: 'as-rem-body' },
        h('h3', { class: 'section-label' }, 'Pendientes'),
        pend.length ? h('ul', { class: 'as-rem-list' }, ...pend.map((p) => item(p.titulo, p.fecha ? `${relativeDay(p.fecha)}${p.hora ? ` · ${p.hora}` : ''}` : '', p.fecha && p.fecha < today))) : h('p', { class: 'as-rem-empty' }, 'Nada pendiente.'),
        h('h3', { class: 'section-label' }, 'Próximos 14 días'),
        evs.length ? h('ul', { class: 'as-rem-list' }, ...evs.map((e) => item(e.titulo, `${relativeDay(e.fecha < today ? today : e.fecha)}${e.hora ? ` · ${e.hora}` : ''}`))) : h('p', { class: 'as-rem-empty' }, 'Sin eventos.'),
        lectura.actualizado ? h('p', { class: 'as-updated' }, `Actualizado: ${fmtStamp(lectura.actualizado)}`) : null));
  }
  lecturaListeners.add(paintRemember);
  paintRemember();

  show(
    h('div', { class: 'as-privacy' }, icon('lock', 18),
      h('p', {}, 'Solo puedes añadir apuntes; el docente los revisa antes de guardarlos. No escribas datos de salud ni situaciones familiares.')),
    h('div', { class: 'as-grid' },
      h('section', { class: 'as-main', 'aria-label': 'Nuevo apunte' },
        h('div', { class: 'segmented as-tabs', role: 'tablist', 'aria-label': 'Tipo de apunte' }, tabEls),
        status,
        fTarea, fEvento, fObs, fTut),
      h('aside', { class: 'as-aside', 'aria-label': 'Para recordar' }, remember)),
    h('div', { class: 'as-foot' },
      h('span', { class: 'as-foot-dev' }, deviceName ? `Dispositivo: ${deviceName}` : ''),
      forgetBtn()));
}

// ---------- Arranque ----------
async function main() {
  const key = readKey();
  if (!key) {
    return message({ title: 'Este enlace no es válido o se ha olvidado en este dispositivo', text: 'Pide al docente que te envíe de nuevo el enlace de acceso.', ic: 'link', tone: 'as-msg-warn' });
  }
  try { session = await connect(key); }
  catch (e) {
    return message({ title: 'No se pudo conectar', text: e.message || 'Revisa la conexión a internet.', ic: 'link', tone: 'as-msg-warn', actions: [h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, 'Reintentar')] });
  }
  let st;
  try { st = await session.status(); }
  catch { return message({ title: 'No se pudo comprobar el acceso', text: 'Revisa la conexión e inténtalo de nuevo.', ic: 'link', tone: 'as-msg-warn', actions: [h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, 'Reintentar')] }); }
  route(st);
  if (st === 'invalida') return;
  stopStatus = session.watchStatus((s) => {
    if (s === 'error' || s === lastStatus) return;
    // Mientras se pide el nombre no hay nada que cambiar desde fuera
    route(s);
    if (s === 'aprobado' && !stopLectura) startLectura();
    if (s !== 'aprobado' && stopLectura) { stopLectura(); stopLectura = null; lectura = null; }
  });
  if (st === 'aprobado') startLectura();
}

function startLectura() {
  stopLectura = session.watchLectura((data, err) => {
    if (err === 'invalida') {
      // Sin lectura: puede ser que aún no esté aprobado o que el acceso se haya cerrado
      session.status().then((s) => { if (s === 'invalida') route('invalida'); }).catch(() => {});
      return;
    }
    lectura = data;
    lecturaListeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  });
}

main();
