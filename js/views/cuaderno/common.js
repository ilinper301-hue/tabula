// Tabula · Cuaderno · utilidades de interfaz comunes
import { h, icon, fromISO, MESES } from '../../ui.js';
import { toLevel, formatGrade, LEVEL_LABELS } from '../../grading.js';

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const trunc = (s, n) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
export const shortDate = (iso) => { if (!iso) return ''; const d = fromISO(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };

/** Clase de color de la etiqueta de cada nivel: IN avisa (acento), el resto usa las etiquetas t2..t6. */
export const LEVEL_CLASS = { IN: 'cb-lv-in', SU: 't5', BI: 't2', NT: 't3', SB: 't6' };

/** Chip de nivel para una nota 0–10 (vacío si no hay nota). */
export function levelChip(n, cls = '') {
  const lv = toLevel(n);
  if (!lv) return null;
  return h('span', { class: `chip cb-chip ${LEVEL_CLASS[lv]} ${cls}`, title: LEVEL_LABELS[lv] }, lv);
}

/** Texto numérico de una nota ("7,5") para columnas y exportación. */
export const num = (n) => formatGrade(n, 'numerica');

/** Campo etiquetado: field('Nombre', input, 'ayuda') */
export function field(label, control, hint) {
  const id = control.id || (control.id = 'cb' + Math.random().toString(36).slice(2, 8));
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('span', { class: 'cb-hint' }, hint) : null);
}

/** Control segmentado accesible. options = [[valor, etiqueta]]. */
export function segmented(options, value, onChange, label) {
  const wrap = h('div', { class: 'segmented cb-seg', role: 'group', 'aria-label': label || null });
  const paint = (v) => wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === v)));
  options.forEach(([v, text]) => wrap.append(h('button', {
    type: 'button', dataset: { v: String(v) }, 'aria-selected': String(String(v) === String(value)),
    onclick: () => { paint(String(v)); onChange(v); },
  }, text)));
  return wrap;
}

/** Confirmación dentro de la propia hoja (nunca window.confirm). Devuelve {trigger, box}. */
export function confirmDelete({ label, question, yes, onYes }) {
  const box = h('div', { class: 'cb-confirm', role: 'alertdialog', 'aria-label': 'Confirmar eliminación', hidden: true },
    h('p', {}, question),
    h('div', { class: 'cb-confirm-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => { box.hidden = true; trigger.hidden = false; } }, 'No, conservar'),
      h('button', { type: 'button', class: 'btn btn-danger', onclick: onYes }, yes)));
  const trigger = h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: () => {
    trigger.hidden = true; box.hidden = false; box.querySelector('.btn').focus();
  } }, icon('trash', 16), label);
  return { trigger, box };
}

/** Navega dentro del cuaderno conservando el resto de parámetros. */
export function href({ grupo, area, ev }) {
  const p = new URLSearchParams();
  if (grupo) p.set('grupo', grupo);
  if (area) p.set('area', area);
  if (ev) p.set('ev', ev);
  return `#/cuaderno?${p}`;
}

/** Nombre de archivo seguro (sin tildes ni símbolos). */
export const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
