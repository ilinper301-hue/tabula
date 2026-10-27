// Tabula · Documentos · hoja «Programar impresión» (añadir a la cola o editar un elemento)
import { store } from '../../store.js';
import { h, icon, openSheet, toast, todayISO, relativeDay } from '../../ui.js';
import { nextSchoolDay, defaultCopies } from '../../documents.js';
import { getGroups, getStudents } from '../../school.js';
import { isLectivo } from '../../planning.js';
import { thumb, getDoc, plural, weekdayLong } from './common.js';

const nextDay = (iso) => nextSchoolDay(iso, (d) => { try { return isLectivo(d, store.list('events')); } catch { return true; } });

/**
 * @param o { documentoId, itemId? (editar), fecha?, groupId?, sesionId?, nota?, onDone(item) }
 */
export function openScheduleSheet(o) {
  const editing = o.itemId ? store.get('impresiones', o.itemId) : null;
  const doc = getDoc(editing ? editing.documentoId : o.documentoId);
  if (!doc) { toast('Ese documento ya no existe'); return null; }
  const last = store.getSetting('impresion', { dobleCara: false, color: false }) || {};
  const groups = getGroups();
  const today = todayISO();
  const tomorrow = nextDay(today);

  const state = {
    fecha: editing ? (editing.fecha || '') : (o.fecha !== undefined ? o.fecha : today),
    groupId: editing ? (editing.groupId || '') : (o.groupId || doc.groupId || (groups.length === 1 ? groups[0].id : '')),
    copias: 1,
    dobleCara: editing ? !!editing.dobleCara : !!last.dobleCara,
    color: editing ? !!editing.color : !!last.color,
  };
  const groupCopies = (gid) => (gid ? defaultCopies(getStudents(gid).length) : 1);
  state.copias = editing ? (editing.copias || 1) : (doc.copias || groupCopies(state.groupId));

  // ---------- Fecha ----------
  const dateInput = h('input', { class: 'input dc-date-input', type: 'date', 'aria-label': 'Elegir fecha', value: state.fecha || today, min: '2020-01-01' });
  const chipsBox = h('div', { class: 'dc-date-chips', role: 'group', 'aria-label': 'Fecha' });
  const dateNote = h('p', { class: 'dc-hint dc-date-note' });
  const mode = () => (!state.fecha ? 'none' : state.fecha === today ? 'hoy' : state.fecha === tomorrow ? 'manana' : 'otra');
  function paintDate() {
    const m = mode();
    const chip = (key, label, sub, pick) => h('button', {
      type: 'button', class: `dc-chip-btn${m === key ? ' on' : ''}`, 'aria-pressed': String(m === key), onclick: pick,
    }, label, sub ? h('small', {}, sub) : null);
    chipsBox.replaceChildren(
      chip('hoy', 'Hoy', null, () => { state.fecha = today; paintDate(); }),
      chip('manana', 'Mañana', tomorrow !== relativeDayISO(1) ? weekdayLong(tomorrow) : null, () => { state.fecha = tomorrow; paintDate(); }),
      chip('otra', 'Elegir fecha', null, () => { state.fecha = dateInput.value || today; paintDate(); dateInput.focus(); if (dateInput.showPicker) { try { dateInput.showPicker(); } catch {} } }),
      chip('none', 'Sin fecha', null, () => { state.fecha = ''; paintDate(); }));
    dateInput.hidden = m !== 'otra';
    if (state.fecha) dateInput.value = state.fecha;
    dateNote.textContent = state.fecha ? `${weekdayLong(state.fecha)}, ${Number(state.fecha.slice(8))} ${new Date(state.fecha + 'T12:00').toLocaleDateString('es-ES', { month: 'long' })}` : 'Aparecerá en «Sin fecha», sin aviso en Hoy.';
  }
  function relativeDayISO(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }
  dateInput.addEventListener('change', () => { if (dateInput.value) { state.fecha = dateInput.value; paintDate(); } });

  // ---------- Grupo y copias ----------
  const groupSel = h('select', { class: 'select', id: 'dc-sch-group' },
    h('option', { value: '' }, 'Sin grupo'),
    ...groups.map((g) => h('option', { value: g.id, selected: g.id === state.groupId }, `${g.nombre} · ${plural(getStudents(g.id).length, 'alumno', 'alumnos')}`)));
  const copies = h('input', { class: 'input dc-copies-input', id: 'dc-sch-copies', type: 'number', inputmode: 'numeric', min: '1', max: '99', value: String(state.copias), 'aria-label': 'Número de copias' });
  const setCopies = (n) => { state.copias = Math.min(99, Math.max(1, Math.round(Number(n)) || 1)); copies.value = String(state.copias); };
  copies.addEventListener('change', () => setCopies(copies.value));
  copies.addEventListener('input', () => { const n = Number(copies.value); if (n >= 1) state.copias = Math.min(99, n); });
  groupSel.addEventListener('change', () => {
    state.groupId = groupSel.value;
    if (state.groupId) setCopies(groupCopies(state.groupId));
  });

  const stepper = h('div', { class: 'dc-stepper' },
    h('button', { type: 'button', class: 'icon-btn dc-step', 'aria-label': 'Una copia menos', onclick: () => setCopies(state.copias - 1) }, icon('minus', 18)),
    copies,
    h('button', { type: 'button', class: 'icon-btn dc-step', 'aria-label': 'Una copia más', onclick: () => setCopies(state.copias + 1) }, icon('plus', 18)));

  const toggle = (key, label, hint) => {
    const sw = h('input', { type: 'checkbox', class: 'switch', checked: state[key], 'aria-label': label });
    sw.addEventListener('change', () => { state[key] = sw.checked; });
    return h('label', { class: 'switch-row dc-switch-row' }, h('span', {}, h('strong', { class: 'dc-sw-label' }, label), h('small', { class: 'dc-hint' }, hint)), sw);
  };

  const note = h('input', { class: 'input', id: 'dc-sch-note', type: 'text', maxlength: 120, placeholder: 'Ej.: grapar, para el grupo de refuerzo…', value: editing ? editing.nota || '' : o.nota || '' });

  const save = () => {
    const data = {
      documentoId: doc.id, fecha: state.fecha || '', copias: state.copias, dobleCara: state.dobleCara, color: state.color,
      groupId: state.groupId || '', nota: note.value.trim(),
    };
    if (o.sesionId || editing?.sesionId) data.sesionId = o.sesionId || editing.sesionId;
    store.setSetting('impresion', { dobleCara: state.dobleCara, color: state.color });
    let item;
    if (editing) { item = store.update('impresiones', editing.id, data); toast('Cambios guardados'); }
    else {
      item = store.add('impresiones', { ...data, estado: 'pendiente' });
      toast(`Programado: ${plural(state.copias, 'copia', 'copias')}${state.fecha ? ` · ${relativeDay(state.fecha).toLowerCase()}` : ''}`,
        { label: 'Ver cola', run: () => { location.hash = '#/documentos?tab=imprimir'; } });
    }
    close();
    o.onDone && o.onDone(item);
  };

  const body = h('div', { class: 'dc-sheet-form' },
    h('div', { class: 'dc-sch-doc' }, thumb(doc, { label: false, size: 22 }),
      h('div', { class: 'dc-sch-doc-text' }, h('strong', {}, doc.titulo), doc.paginas ? h('span', { class: 'dc-hint' }, plural(doc.paginas, 'página', 'páginas')) : null)),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, '¿Para cuándo?'), chipsBox, dateInput, dateNote),
    h('div', { class: 'field' }, h('label', { for: 'dc-sch-group' }, 'Grupo'), groupSel),
    h('div', { class: 'field' }, h('label', { for: 'dc-sch-copies' }, 'Copias'), stepper),
    toggle('dobleCara', 'Doble cara', 'Ahorra hojas en documentos de varias páginas'),
    toggle('color', 'En color', 'Si no, en blanco y negro'),
    h('div', { class: 'field' }, h('label', { for: 'dc-sch-note' }, 'Nota (opcional)'), note),
    h('div', { class: 'dc-actions end' },
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, icon('printer', 16), editing ? 'Guardar' : 'Añadir a la cola')));

  paintDate();
  const close = openSheet(editing ? 'Editar impresión' : 'Programar impresión', body);
  return close;
}
