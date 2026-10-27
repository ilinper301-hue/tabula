// Tabula · Encuestas · utilidades de interfaz comunes
import { h, icon, toast, toISO, relativeDay } from '../../ui.js';

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Nombre de archivo seguro (sin tildes ni símbolos). */
export const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

// Iconos propios de esta sección (mismo trazo que los de ui.js, que no tiene estos).
const PATHS = {
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1"/><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  poll: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  send: '<path d="m4 12 16-8-6 16-2.5-6.5z"/>',
};
/** Icono de la sección; si no existe aquí, usa los de ui.js. */
export function eicon(name, size = 18, extra = '') {
  if (!PATHS[name]) return icon(name, size, extra);
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon ${extra}" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
  return t.content.firstChild;
}

export const STATES = {
  borrador: { label: 'Borrador', cls: 't5' },
  abierta: { label: 'Abierta', cls: 't3' },
  cerrada: { label: 'Cerrada', cls: 't2' },
};
export const stateChip = (s) => {
  const st = STATES[s.estado] || STATES.borrador;
  return h('span', { class: `chip ${st.cls}` }, st.label);
};
export const programChip = (p) => (p ? h('span', { class: `chip ${p.color || 't1'}` }, p.nombre) : null);

const pad = (n) => String(n).padStart(2, '0');
/** "Hoy, 12:30" · "Ayer, 09:05" · "3 nov, 18:20" */
export function fmtWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${relativeDay(toISO(d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fmtFull = (ts) => new Date(ts).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });

/** "2026-11-03" → "03/11/2026" (respuestas de tipo Fecha). */
export const fmtDateAnswer = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v);

/** Copia al portapapeles; si no se puede, selecciona el texto del campo para copiar a mano. */
export async function copyText(text, field) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      if (field) { field.focus(); field.select(); field.setSelectionRange(0, text.length); }
      if (document.execCommand('copy')) return true;
    } catch {}
    toast('Selecciona el texto y cópialo manualmente');
    return false;
  }
}

/** Descarga un texto como archivo. */
export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Texto amable para un error de Firebase o de las reglas de la encuesta. */
export function friendlyError(e) {
  const code = String(e?.code || '');
  if (code.includes('permission-denied')) return 'La nube no ha dado permiso. Comprueba que has iniciado sesión con Google y que las reglas de Firestore de Tabula (firestore.rules) están publicadas.';
  if (code.includes('unavailable') || code.includes('network') || !navigator.onLine) return 'Sin conexión con la nube. Comprueba internet e inténtalo de nuevo.';
  if (e?.message && !code) return e.message; // errores propios de surveys.js (ya en español)
  return 'No se ha podido completar la operación. Inténtalo de nuevo.';
}

/** Confirmación en dos pasos dentro de la propia página (nunca window.confirm). */
export function inlineConfirm({ label, question, yes, cancel = 'No, conservar', onYes, triggerClass = 'btn btn-ghost btn-danger' }) {
  const box = h('div', { class: 'enc-confirm', role: 'alertdialog', 'aria-label': 'Confirmar', hidden: true },
    h('p', {}, question),
    h('div', { class: 'enc-confirm-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => { box.hidden = true; trigger.hidden = false; trigger.focus(); } }, cancel),
      h('button', { type: 'button', class: 'btn btn-danger enc-yes', onclick: onYes }, yes)));
  const trigger = h('button', { type: 'button', class: triggerClass, onclick: () => {
    trigger.hidden = true; box.hidden = false; box.querySelector('.btn').focus();
  } }, icon('trash', 16), label);
  return { trigger, box };
}

/** Agrupa avisos seguidos en uno solo (las respuestas llegan de una en una). */
export function debounce(fn, ms) {
  let t;
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
