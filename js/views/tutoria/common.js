// Tabula · Tutoría · utilidades comunes (campos, fechas, selector de alumnado, controles segmentados)
import { h, icon, MESES, DIAS, fromISO, todayISO, openSheet } from '../../ui.js';
import { fullName, listName, initials } from '../../school.js';

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export { fullName, listName, initials, todayISO };

/** "5 oct" */
export function shortDate(iso) {
  if (!iso) return '';
  const d = fromISO(iso);
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}
/** "5 oct 2026" (año solo si no es el actual) */
export function mediumDate(iso) {
  if (!iso) return '';
  const d = fromISO(iso);
  const y = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}${y}`;
}
/** "lunes, 5 de octubre de 2026" */
export function longDate(iso) {
  const d = fromISO(iso);
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

let fid = 0;
/** Campo con etiqueta asociada. */
export function field(label, control, hint) {
  const id = control.id || (control.id = `tu-f${++fid}`);
  return h('div', { class: 'field' }, h('label', { for: id }, label), control,
    hint ? h('span', { class: 'tu-hint' }, hint) : null);
}

/** Control segmentado accesible (radios). Devuelve { el, get, set }. */
export function segmented(label, options, value, onchange) {
  let cur = value;
  const btns = options.map(([k, text]) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(k === cur), dataset: { v: k },
    onclick: () => set(k, true),
  }, text));
  const el = h('div', { class: 'segmented tu-seg', role: 'radiogroup', 'aria-label': label }, btns);
  function set(k, fire) {
    cur = k;
    btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === k)));
    if (fire && onchange) onchange(k);
  }
  return { el, get: () => cur, set: (k) => set(k, false) };
}

/** Pastilla de aviso: chip con icono opcional. */
export const pill = (text, cls = 't5', ic = null) => h('span', { class: `chip ${cls}` }, ic ? icon(ic, 12) : null, text);

/**
 * Selector de alumnado con búsqueda y casillas.
 * @returns { el, get(): string[], set(ids) }
 */
export function studentPicker(students, selected = [], { onchange, label = 'Alumnado' } = {}) {
  const sel = new Set(selected);
  const chips = h('div', { class: 'tu-picked', 'aria-live': 'polite' });
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Buscar alumno…', 'aria-label': 'Buscar alumno', autocomplete: 'off' });
  const list = h('div', { class: 'tu-pick-list', role: 'group', 'aria-label': label });
  const rows = new Map();

  students.forEach((s) => {
    const cb = h('input', { type: 'checkbox', class: 'tu-pick-cb', checked: sel.has(s.id), onchange: () => toggle(s.id, cb.checked) });
    const row = h('label', { class: 'tu-pick-row' }, cb, h('span', {}, listName(s)));
    rows.set(s.id, { row, cb, name: norm(fullName(s)) });
    list.append(row);
  });
  const none = h('p', { class: 'tu-hint', hidden: true }, 'Nadie coincide con la búsqueda.');
  list.append(none);

  function toggle(id, on) {
    if (on) sel.add(id); else sel.delete(id);
    paint(); onchange && onchange([...sel]);
  }
  function paint() {
    const picked = students.filter((s) => sel.has(s.id));
    chips.replaceChildren(...(picked.length
      ? picked.map((s) => h('span', { class: 'tu-pchip' }, fullName(s),
        h('button', { type: 'button', 'aria-label': `Quitar a ${fullName(s)}`, onclick: () => { rows.get(s.id).cb.checked = false; toggle(s.id, false); } }, icon('x', 12))))
      : [h('span', { class: 'tu-hint' }, 'Nadie seleccionado')]));
    rows.forEach((r, id) => { r.cb.checked = sel.has(id); });
  }
  q.addEventListener('input', () => {
    const t = norm(q.value.trim());
    let n = 0;
    rows.forEach((r) => { const show = !t || r.name.includes(t); r.row.hidden = !show; if (show) n++; });
    none.hidden = n > 0;
  });
  paint();
  return {
    el: h('div', { class: 'tu-picker' }, chips, students.length > 8 ? q : null, list),
    get: () => students.filter((s) => sel.has(s.id)).map((s) => s.id),
    set: (ids) => { sel.clear(); ids.forEach((i) => sel.add(i)); paint(); },
  };
}

/** Anchura mayor para la hoja (se aplica tras abrirla). */
export function wideSheet(contentEl, width = 560) {
  requestAnimationFrame(() => {
    const s = contentEl.closest('.sheet');
    if (s) s.classList.add('tu-sheet');
    if (s) s.style.setProperty('--tu-w', `${width}px`);
  });
}

/** Aviso pequeño y tranquilo sobre datos personales. */
export const privacyNote = () => h('p', { class: 'tu-privacy' }, icon('lock', 14),
  h('span', {}, 'Son datos personales del alumnado y están protegidos. Se guardan en este dispositivo y en tu cuenta; el bloqueo con PIN de Ajustes los protege también.'));

/** Nombre corto de cada medida (para chips pequeños). */
export const MEDIDA_SHORT = {
  refuerzo: 'Refuerzo', agrupamiento: 'Agrupamiento', pra: 'PRA', profundizacion: 'Profundización', accion_tutorial: 'Seguimiento tutorial',
  pt: 'PT', al: 'AL', pe: 'PE', acs: 'ACS', aac: 'AAC', acai: 'ACAI', flexibilizacion: 'Flexibilización', ate: 'Monitor/PTIS', otra: 'Otra medida',
};

// Hojas abiertas desde Tutoría: se cierran al salir de la vista (p. ej. con «atrás» del navegador).
const openSheets = new Set();
export function sheet(title, content) {
  let close;
  close = openSheet(title, content, { onClose: () => openSheets.delete(close) });
  openSheets.add(close);
  return close;
}
export const closeSheets = () => [...openSheets].forEach((c) => c());
