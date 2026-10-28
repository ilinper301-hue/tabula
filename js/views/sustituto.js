// Tabula · «Mañana falto»: hoja para preparar, revisar e imprimir el plan del sustituto.
// Se abre desde Hoy y desde el detalle de un día de Calendario (openSustituto({ fecha })).
import { store } from '../store.js';
import { h, icon, openSheet, toast, todayISO, relativeDay } from '../ui.js';
import {
  schoolDays, nextSchoolDay, gatherDay, gatherGroup, buildPlanHTML, planTitle, dayHeading, shortDay,
  NORMAS_DEFAULT, normasKey,
} from '../sustituto.js';

/** Imprime con un marco oculto (el HTML ya va escapado y no lleva scripts). */
function printPlan(html) {
  document.querySelectorAll('iframe.su-print-frame').forEach((f) => f.remove());
  return new Promise((resolve) => {
    const frame = h('iframe', { class: 'su-print-frame', 'aria-hidden': 'true', tabindex: '-1', style: 'position:fixed;right:0;bottom:0;width:794px;height:1123px;border:0;visibility:hidden' });
    frame.addEventListener('load', () => setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { console.warn('No se pudo imprimir', e); }
      resolve();
    }, 300));
    frame.srcdoc = html;
    document.body.append(frame);
    setTimeout(() => frame.remove(), 10 * 60 * 1000);
  });
}

let seq = 0;
const uid = (p) => `${p}${++seq}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function openSustituto({ fecha } = {}) {
  const today = todayISO();
  const next = nextSchoolDay(today);
  let mode = !fecha || fecha === next ? 'manana' : fecha === today ? 'hoy' : 'otra';
  const state = { start: fecha || next, n: 1, medidas: store.getSetting('sustituto:medidas', true) !== false, ausencia: false };
  const cache = new Map();          // fecha -> día reunido (con las ediciones)
  const normasEdit = new Map();     // groupId -> texto editado
  const dayData = (iso) => { if (!cache.has(iso)) cache.set(iso, gatherDay(iso)); return cache.get(iso); };
  const dates = () => schoolDays(state.start, state.n);

  // ---------- Cuándo ----------
  const whenBox = h('div', { class: 'su-when' });
  const daysBox = h('div', { class: 'su-days' });
  const groupsBox = h('div', { class: 'su-groups' });
  const queueInfo = h('span', { class: 'su-queue-info', 'aria-live': 'polite' });
  const queueBtn = h('button', { type: 'button', class: 'btn btn-sm', onclick: () => addToQueue() }, icon('printer', 16), 'Añadir a la cola de impresión');

  const dateInput = h('input', { class: 'input su-date', type: 'date', 'aria-label': 'Elegir fecha', value: state.start });
  dateInput.addEventListener('change', () => { if (dateInput.value) { state.start = dateInput.value; mode = 'otra'; paintWhen(); paintDays(); } });

  function chip(label, key, onpick) {
    return h('button', { type: 'button', class: 'su-chip', 'aria-pressed': String(mode === key), onclick: () => { mode = key; onpick(); paintWhen(); paintDays(); } }, label);
  }
  function paintWhen() {
    const ds = dates();
    const first = ds[0];
    const summary = ds.length > 1 ? `${cap(dayHeading(first).toLowerCase())} – ${shortDay(ds[ds.length - 1])}` : cap(dayHeading(first).toLowerCase());
    const note = state.start !== first && !ds.includes(state.start)
      ? h('p', { class: 'su-note', role: 'status' }, `El ${shortDay(state.start)} no es lectivo: se muestra el siguiente día lectivo.`) : null;
    dateInput.value = state.start;
    whenBox.replaceChildren(
      h('div', { class: 'su-chips', role: 'group', 'aria-label': 'Día de la ausencia' },
        chip('Hoy', 'hoy', () => { state.start = today; }),
        chip(cap(relativeDay(next).toLowerCase()), 'manana', () => { state.start = next; }),
        chip('Elegir fecha', 'otra', () => { setTimeout(() => dateInput.focus(), 0); })),
      ...(mode === 'otra' ? [h('div', { class: 'su-date-row' }, h('label', { class: 'sr-only', for: 'su-date' }, 'Fecha'), Object.assign(dateInput, { id: 'su-date' }))] : []),
      h('div', { class: 'su-range' },
        h('span', { class: 'field-label', id: 'su-n-l' }, 'Días seguidos'),
        h('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'su-n-l' },
          ...[1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', 'aria-pressed': String(state.n === n), 'aria-label': plural(n, 'día', 'días'), onclick: () => { state.n = n; paintWhen(); paintDays(); } }, String(n))))),
      h('p', { class: 'su-summary' }, summary),
      ...(note ? [note] : []));
  }

  // ---------- Días y franjas ----------
  function includeCheck(label, checked, onchange) {
    const input = h('input', { type: 'checkbox', class: 'check', checked, onchange: () => onchange(input.checked) });
    return h('label', { class: 'su-inc' }, input, h('span', {}, label));
  }

  function slotCard(slot) {
    const isClass = slot.tipo === 'clase';
    const card = h('div', { class: `su-slot${isClass ? '' : ' is-break'}${slot.incluir ? '' : ' is-off'}` });
    const body = h('div', { class: 'su-slot-body', hidden: !slot.incluir || !isClass });
    const tags = [slot.groupName, slot.aula, slot.apoyos.length ? `Apoyo: ${slot.apoyos.join(', ')}` : null].filter(Boolean);
    card.append(h('div', { class: 'su-slot-head' },
      h('span', { class: 'su-time' }, slot.inicio, h('span', {}, slot.fin)),
      h('div', { class: 'su-slot-title' }, h('strong', {}, slot.titulo), tags.length ? h('span', { class: 'su-slot-tags' }, tags.join(' · ')) : null),
      includeCheck(`Incluir ${slot.titulo} de ${slot.inicio}`, slot.incluir, (v) => {
        slot.incluir = v; card.classList.toggle('is-off', !v); body.hidden = !v || !isClass; paintGroups(); paintQueue();
      })));
    if (isClass) {
      const id = uid('su-q');
      const ta = h('textarea', { class: 'textarea su-que', id, rows: 3, placeholder: 'Repaso / lectura / ficha…', value: slot.que });
      ta.addEventListener('input', () => { slot.que = ta.value; });
      body.append(h('label', { class: 'su-lbl', for: id }, 'Qué hacer'), ta);
      if (slot.sesiones.length) body.append(h('p', { class: 'su-ses' }, icon('planificacion', 14), `Sesión planificada: ${slot.sesiones.map((s) => s.titulo || 'sin título').join(' · ')}`));
      const extra = [slot.objetivo ? `Objetivo: ${slot.objetivo}` : null, slot.materiales ? `Materiales: ${slot.materiales}` : null].filter(Boolean);
      if (extra.length) body.append(h('p', { class: 'su-extra' }, extra.join(' · ')));
      if (slot.docs.length) {
        body.append(h('div', { class: 'su-docs' }, h('span', { class: 'su-lbl' }, 'Documentos adjuntos'),
          ...slot.docs.map((d) => includeCheck(`${d.titulo} · incluir para imprimir`, d.incluir, (v) => { d.incluir = v; paintQueue(); }))));
      }
      card.append(body);
    }
    return card;
  }

  function paintDays() {
    const ds = dates();
    daysBox.replaceChildren(...ds.map((iso) => {
      const day = dayData(iso);
      const real = day.slots.length;
      return h('section', { class: 'su-day', 'aria-label': dayHeading(iso) },
        h('h3', { class: 'su-day-title' }, dayHeading(iso)),
        day.eventos.length ? h('p', { class: 'su-events' }, icon('calendario', 15), day.eventos.map((e) => (e.hora ? `${e.hora} ${e.titulo}` : e.titulo)).join(' · ')) : null,
        real ? h('div', { class: 'su-slots' }, ...day.slots.map(slotCard))
          : h('div', { class: 'su-empty' }, 'No tienes sesiones en el horario de este día.'));
    }));
    paintGroups(); paintQueue();
  }

  // ---------- Alumnado, normas ----------
  function currentGroupIds() {
    const ids = [];
    dates().forEach((iso) => dayData(iso).slots.forEach((s) => { if (s.incluir && s.tipo === 'clase' && s.groupId && !ids.includes(s.groupId)) ids.push(s.groupId); }));
    return ids;
  }
  const groupCache = new Map();
  function groupData(gid) {
    const key = `${gid}|${dates()[0]}`;
    if (!groupCache.has(key)) groupCache.set(key, gatherGroup(gid, dates()));
    const g = groupCache.get(key);
    if (g && normasEdit.has(gid)) g.normas = normasEdit.get(gid);
    return g;
  }

  function paintGroups() {
    const ids = currentGroupIds();
    if (!ids.length) {
      groupsBox.replaceChildren(h('div', { class: 'su-empty' }, 'Cuando haya alguna clase incluida, aquí verás la lista del alumnado y las normas del aula.'));
      return;
    }
    const medToggle = h('label', { class: 'switch-row su-med' },
      h('span', {}, h('strong', {}, 'Incluir alumnado con medidas'),
        h('span', { class: 'su-hint' }, 'Solo se imprime «Necesita apoyo: nombre — consultar con el equipo de orientación / tutor». Los datos sensibles (tipo de medida, diagnóstico, observaciones) nunca se imprimen.')),
      h('input', { type: 'checkbox', class: 'switch', checked: state.medidas, 'aria-label': 'Incluir alumnado con medidas', onchange: (e) => { state.medidas = e.target.checked; store.setSetting('sustituto:medidas', state.medidas); paintGroups(); } }));
    const cards = ids.map((gid) => {
      const g = groupData(gid);
      if (!g) return null;
      const taId = uid('su-n');
      const ta = h('textarea', { class: 'textarea su-normas', id: taId, rows: 7, value: g.normas });
      ta.addEventListener('input', () => { normasEdit.set(gid, ta.value); });
      ta.addEventListener('change', () => store.setSetting(normasKey(gid), ta.value));
      const reset = h('button', { type: 'button', class: 'link-btn', onclick: () => { ta.value = NORMAS_DEFAULT; normasEdit.set(gid, ta.value); store.setSetting(normasKey(gid), ta.value); } }, 'Restaurar texto de ejemplo');
      return h('div', { class: 'su-group card' },
        h('h3', { class: 'su-day-title' }, g.nombre),
        h('p', { class: 'su-hint' }, `${plural(g.alumnos.length, 'alumno/a', 'alumnos/as')} · se imprime numerado, con una columna por día para pasar lista a mano.`),
        g.responsables.length ? h('p', { class: 'su-resp' }, h('strong', {}, 'Responsables de la semana: '), g.responsables.map((r) => `${r.rol}: ${r.nombre}`).join(' · ')) : null,
        state.medidas && g.apoyo.length ? h('ul', { class: 'su-apoyo', 'aria-label': 'Alumnado que necesita apoyo' }, ...g.apoyo.map((n) => h('li', {}, h('strong', {}, `Necesita apoyo: ${n}`), ' — consultar con el equipo de orientación / tutor'))) : null,
        h('div', { class: 'field', style: { marginTop: '14px', marginBottom: '0' } },
          h('div', { class: 'su-normas-head' }, h('label', { for: taId }, 'Normas y rutinas de clase'), reset),
          ta, h('p', { class: 'su-hint' }, 'Se guardan y se reutilizan la próxima vez.')));
    }).filter(Boolean);
    groupsBox.replaceChildren(medToggle, ...cards);
  }

  // ---------- Contacto, opciones ----------
  const contacto = h('textarea', { class: 'textarea su-contacto', id: 'su-contacto', rows: 2, placeholder: 'Ej. Jefatura de estudios (ext. 3) · Marta, de 1º B, en el aula de al lado', value: store.getSetting('sustituto:contacto', '') || '' });
  contacto.addEventListener('change', () => store.setSetting('sustituto:contacto', contacto.value.trim()));

  const ausencia = h('input', { type: 'checkbox', class: 'switch', 'aria-label': 'Añadir «Ausencia» al calendario', onchange: (e) => { state.ausencia = e.target.checked; } });

  // ---------- Cola de impresión ----------
  function selectedDocs() {
    const out = [];
    dates().forEach((iso) => dayData(iso).slots.forEach((s) => {
      if (!s.incluir) return;
      s.docs.forEach((d) => { if (d.incluir) out.push({ doc: d, fecha: iso, groupId: s.groupId }); });
    }));
    return out;
  }
  function paintQueue() {
    const n = selectedDocs().length;
    queueBtn.disabled = !n;
    queueInfo.textContent = n ? `${plural(n, 'documento seleccionado', 'documentos seleccionados')}` : 'Ninguna sesión tiene documentos adjuntos.';
  }
  function addToQueue() {
    const sel = selectedDocs();
    if (!sel.length) return;
    const existing = store.list('impresiones');
    let added = 0;
    sel.forEach(({ doc, fecha, groupId }) => {
      if (existing.some((i) => i.documentoId === doc.id && i.fecha === fecha && i.estado === 'pendiente')) return;
      const copias = groupId ? Math.max(1, store.list('students').filter((s) => s.groupId === groupId).length) : 1;
      store.add('impresiones', { documentoId: doc.id, fecha, copias, dobleCara: false, color: false, estado: 'pendiente', groupId: groupId || null, nota: 'Plan para el sustituto' });
      added++;
    });
    toast(added ? `${plural(added, 'documento añadido', 'documentos añadidos')} a la cola de impresión` : 'Ya estaban en la cola de impresión');
  }

  // ---------- Generar, imprimir, guardar ----------
  function buildHTML() {
    const ds = dates();
    const groups = currentGroupIds().map(groupData).filter(Boolean);
    return buildPlanHTML({
      days: ds.map(dayData), groups, contacto: contacto.value, incluirMedidas: state.medidas,
    }, store.getSetting('profile', {}) || {});
  }
  function persistTexts() {
    store.setSetting('sustituto:contacto', contacto.value.trim());
    normasEdit.forEach((txt, gid) => store.setSetting(normasKey(gid), txt));
  }
  function maybeAbsence() {
    if (!state.ausencia) return;
    const ds = dates();
    const events = store.list('events');
    if (events.some((e) => e.titulo === 'Ausencia' && e.fecha === ds[0])) return;
    store.add('events', { titulo: 'Ausencia', fecha: ds[0], fechaFin: ds.length > 1 ? ds[ds.length - 1] : null, hora: null, tipo: 'otro', groupId: null, notas: 'Plan para el sustituto preparado.' });
  }
  const printBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
    persistTexts(); maybeAbsence();
    printBtn.disabled = true;
    try { await printPlan(buildHTML()); } finally { printBtn.disabled = false; }
  } }, icon('printer', 18), 'Imprimir plan');
  const saveBtn = h('button', { type: 'button', class: 'btn', onclick: async () => {
    persistTexts(); maybeAbsence();
    saveBtn.disabled = true;
    try {
      const { saveFicha } = await import('./documentos/claude.js');
      const doc = await saveFicha(buildHTML(), planTitle(dates()));
      toast('Plan guardado en Documentos', { label: 'Ver', run: () => { close(); location.hash = `#/documentos?doc=${doc.id}`; } });
    } catch (e) { console.warn(e); toast('No se pudo guardar el plan'); } finally { saveBtn.disabled = false; }
  } }, icon('documentos', 18), 'Guardar en Documentos');

  const section = (title, ...kids) => h('section', { class: 'su-section' }, h('h3', { class: 'section-label' }, title), ...kids);
  const content = h('div', { class: 'su-wrap' },
    h('p', { class: 'su-lead' }, 'Elige el día y revisa lo que verá la persona que te sustituya. Puedes editar cada tarea antes de imprimir.'),
    section('Cuándo faltas', whenBox),
    section('Horario y tareas', daysBox),
    section('Alumnado y normas', groupsBox),
    section('Contacto del centro',
      h('label', { class: 'sr-only', for: 'su-contacto' }, 'Contacto del centro o persona de referencia'), contacto,
      h('p', { class: 'su-hint' }, 'Persona de referencia, extensión o teléfono. Se guarda para la próxima vez.')),
    section('Documentos', h('div', { class: 'su-queue' }, queueBtn, queueInfo)),
    h('label', { class: 'switch-row su-aus' }, h('span', {}, h('strong', {}, 'Añadir «Ausencia» al calendario'), h('span', { class: 'su-hint' }, 'Crea un evento con los días elegidos al imprimir o guardar.')), ausencia),
    h('div', { class: 'su-actions' }, printBtn, saveBtn));

  const close = openSheet('Plan para el sustituto', content, { className: 'su-sheet' });
  paintWhen(); paintDays();
  return close;
}
