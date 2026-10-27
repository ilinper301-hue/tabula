// Tabula · Anecdotario · lista de observaciones de un alumno (línea de tiempo por meses).
// Reutilizable: la ficha del alumno, la pestaña «Observaciones» del grupo y el cuaderno la usan.
import { store } from '../../store.js';
import { h, icon, openSheet, toast, todayISO } from '../../ui.js';
import { listName, areaShort, areaColor } from '../../school.js';
import { OBS_TYPES, getTags, listObservations, tally } from '../../observations.js';
import { plural, TYPE_ORDER, signBadge, whenLabel, monthLabel } from './common.js';

const FILTERS = [['', 'Todas'], ['positiva', 'Positivas'], ['negativa', 'A mejorar'], ['neutra', 'Notas']];

/**
 * Pinta en `container` las observaciones de un alumno y se mantiene al día.
 * Permite filtrar por tipo, editar (toca la observación) y eliminar con «Deshacer».
 * @returns {Function} limpieza (deja de escuchar cambios)
 */
export function renderStudentObservations(container, studentId) {
  let filter = '';
  let editingId = null;

  const root = h('div', { class: 'ao-list' });
  container.replaceChildren(root);

  const student = () => store.get('students', studentId);

  function chips(counts) {
    return h('div', { class: 'ao-filters', role: 'group', 'aria-label': 'Filtrar por tipo' },
      FILTERS.map(([k, label]) => {
        const n = k ? counts[k] : counts.total;
        return h('button', {
          type: 'button', class: `ao-filter${k ? ` ao-t-${k}` : ''}`, 'aria-pressed': String(filter === k),
          onclick: () => { filter = k; paint(); },
        }, k ? h('span', { class: 'ao-filter-sign', 'aria-hidden': 'true' }, OBS_TYPES[k].sign) : null,
        label, h('span', { class: 'ao-filter-n' }, String(n)));
      }));
  }

  function item(o) {
    const del = () => {
      const removed = store.remove('observaciones', o.id);
      if (removed) toast('Observación eliminada', { label: 'Deshacer', run: () => store.restore('observaciones', removed) });
    };
    return h('li', { class: `ao-item ao-t-${o.tipo}`, dataset: { id: o.id } },
      h('button', { type: 'button', class: 'ao-item-main', 'aria-label': `Editar observación: ${o.etiqueta || o.texto || OBS_TYPES[o.tipo].label}`, onclick: () => { editingId = o.id; paint(); } },
        signBadge(o.tipo),
        h('span', { class: 'ao-item-body' },
          h('span', { class: 'ao-item-top' },
            o.etiqueta ? h('strong', { class: 'ao-item-tag' }, o.etiqueta) : h('strong', { class: 'ao-item-tag ao-item-plain' }, OBS_TYPES[o.tipo].label),
            o.area ? h('span', { class: `chip ${areaColor(o.area)}` }, areaShort(o.area)) : null),
          o.texto ? h('span', { class: 'ao-item-text' }, o.texto) : null,
          h('span', { class: 'ao-item-meta' }, whenLabel(o)))),
      h('button', { type: 'button', class: 'icon-btn ao-item-del', 'aria-label': 'Eliminar observación', title: 'Eliminar', onclick: del }, icon('trash', 18)));
  }

  /** Edición en línea (sin <form>: la lista puede estar dentro de otro formulario). */
  function editor(o) {
    let tipo = o.tipo;
    const tagSel = h('select', { class: 'select ao-edit-tag', 'aria-label': 'Etiqueta' });
    const fillTags = () => {
      const names = [...getTags()[tipo]];
      if (o.etiqueta && o.tipo === tipo && !names.includes(o.etiqueta)) names.unshift(o.etiqueta);
      tagSel.replaceChildren(h('option', { value: '' }, 'Sin etiqueta'),
        ...names.map((n) => h('option', { value: n, selected: n === o.etiqueta && tipo === o.tipo }, n)));
    };
    const segBtns = TYPE_ORDER.map((t) => h('button', {
      type: 'button', class: `ao-type ao-type-sm ao-t-${t}`, 'aria-pressed': String(t === tipo),
      onclick: () => { tipo = t; segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(TYPE_ORDER[i] === t))); fillTags(); },
    }, h('span', { class: 'ao-type-sign', 'aria-hidden': 'true' }, OBS_TYPES[t].sign), h('span', {}, OBS_TYPES[t].label)));
    fillTags();
    const texto = h('textarea', { class: 'textarea ao-edit-text', rows: 2, maxlength: 600, 'aria-label': 'Texto', placeholder: 'Texto (opcional)' }, o.texto || '');
    const fecha = h('input', {
      class: 'input ao-edit-date', type: 'date', value: o.fecha, max: todayISO(), 'aria-label': 'Fecha',
      onkeydown: (e) => { if (e.key === 'Enter') e.preventDefault(); },
    });
    const cancel = () => { editingId = null; paint(); };
    const save = () => {
      const prev = store.get('observaciones', o.id);
      if (!prev) { cancel(); return; }
      store.update('observaciones', o.id, {
        tipo, etiqueta: tagSel.value || null, texto: texto.value.trim(), fecha: fecha.value || o.fecha,
      });
      editingId = null;
      toast('Observación actualizada', { label: 'Deshacer', run: () => store.restore('observaciones', prev) });
      paint();
    };
    return h('li', { class: 'ao-item ao-editing', dataset: { id: o.id } },
      h('div', { class: 'ao-edit' },
        h('div', { class: 'ao-types ao-types-sm', role: 'group', 'aria-label': 'Tipo' }, segBtns),
        h('div', { class: 'ao-edit-row' }, tagSel, fecha),
        texto,
        h('div', { class: 'ao-edit-actions' },
          h('button', { type: 'button', class: 'btn', onclick: cancel }, 'Cancelar'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, 'Guardar'))));
  }

  function paint() {
    const s = student();
    const all = listObservations({ studentId });
    const counts = tally(all);
    const shown = filter ? all.filter((o) => o.tipo === filter) : all;
    if (editingId && !all.some((o) => o.id === editingId)) editingId = null;

    if (!all.length) {
      root.replaceChildren(h('div', { class: 'ao-empty' }, icon('note', 30),
        h('strong', {}, `Sin observaciones${s ? ` de ${s.nombre}` : ''} todavía`),
        'Las que registres desde «Observar» aparecerán aquí.'));
      return;
    }
    // Agrupa por mes manteniendo el orden (más recientes primero)
    const months = [];
    for (const o of shown) {
      const key = o.fecha.slice(0, 7);
      let m = months[months.length - 1];
      if (!m || m.key !== key) { m = { key, label: monthLabel(o.fecha), items: [] }; months.push(m); }
      m.items.push(o);
    }
    root.replaceChildren(
      chips(counts),
      ...(shown.length
        ? months.map((m) => h('section', { class: 'ao-month', 'aria-label': m.label },
          h('h4', { class: 'ao-month-h' }, m.label, h('span', {}, plural(m.items.length, 'observación', 'observaciones'))),
          h('ul', { class: 'ao-items' }, m.items.map((o) => (o.id === editingId ? editor(o) : item(o))))))
        : [h('p', { class: 'ao-none' }, 'Ninguna observación de este tipo.')]));
  }

  paint();
  const unsub = store.subscribe('observaciones', () => {
    // Mientras se edita no se repinta (se perdería lo escrito); se actualiza al terminar.
    if (editingId && root.querySelector('.ao-editing')) return;
    paint();
  });
  const unsubStu = store.subscribe('students', () => { if (!editingId) paint(); });
  return () => { unsub(); unsubStu(); };
}

/** Hoja con las observaciones de un alumno y botón para añadir otra. */
export function openStudentObservations(studentId) {
  const s = store.get('students', studentId);
  if (!s) return null;
  const box = h('div', { class: 'ao-sheet-list' });
  const stop = renderStudentObservations(box, studentId);
  const add = h('button', { type: 'button', class: 'btn btn-primary ao-add', onclick: () => {
    import('./quick.js').then((m) => m.openQuickObservation({ groupId: s.groupId, studentIds: [s.id] }));
  } }, icon('plus', 16), 'Añadir observación');
  const close = openSheet(listName(s), h('div', {}, h('div', { class: 'ao-sheet-actions' }, add), box), { onClose: stop });
  return close;
}
