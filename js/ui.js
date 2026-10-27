// Tabula · utilidades de interfaz compartidas por todas las vistas

/**
 * Crea elementos DOM de forma segura (el texto nunca se interpreta como HTML).
 * h('button', { class: 'btn', onclick: fn, 'aria-label': 'Cerrar' }, 'Texto', otroNodo)
 * Atributos especiales: class, style (objeto o string), on<evento>, dataset (objeto),
 * checked/value/disabled/selected (propiedades), html (SOLO para iconos internos).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (['checked', 'value', 'disabled', 'selected'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------- Iconos (trazo, heredan currentColor) ----------
const P = {
  hoy: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  tareas: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  documentos: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  grupos: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5"/>',
  cuaderno: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12M15 9v12"/>',
  planificacion: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mas: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  note: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  programas: '<path d="M12 3 4 7v6c0 4.5 3.4 7.6 8 8 4.6-.4 8-3.5 8-8V7z"/><path d="m9 12 2 2 4-4"/>',
  encuestas: '<path d="M5 4h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  fingerprint: '<path d="M12 11v3a8 8 0 0 1-1 4"/><path d="M8.5 7.5A5 5 0 0 1 17 11v1.5"/><path d="M7 11a5 5 0 0 1 .5-2.2"/><path d="M7 14.5c0 2-.5 3.5-1.5 5"/><path d="M16.5 15.5a14 14 0 0 1-1.5 5"/><path d="M4.5 9.5a8 8 0 0 1 14.5-2"/><path d="M19.5 11.5v1.5a17 17 0 0 1-.5 3.5"/>',
  backspace: '<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m16 9-5 5M11 9l5 5"/>',
  logo: '<path d="M5 4h14v16H5z" /><path d="M9 4v16"/><path d="M12.5 9h3.5M12.5 13h3.5"/>',
};

export function icon(name, size = 20, extraClass = '') {
  const s = `<svg class="icon ${extraClass}" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  const t = document.createElement('template');
  t.innerHTML = s;
  return t.content.firstChild;
}

// ---------- Fechas (formato ISO local "YYYY-MM-DD") ----------
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export const addDaysISO = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const diffDays = (isoA, isoB) => Math.round((fromISO(isoA) - fromISO(isoB)) / 86400000);

/** "Hoy", "Mañana", "Ayer", "Jueves", "3 nov" */
export function relativeDay(iso) {
  if (!iso) return '';
  const diff = diffDays(iso, todayISO());
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  const d = fromISO(iso);
  if (diff > 1 && diff < 7) return cap(DIAS[d.getDay()]);
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

/** "Lunes, 26 de octubre" */
export function longDate(d = new Date()) {
  return `${cap(DIAS[d.getDay()])}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export { DIAS, MESES };

export function greeting(d = new Date()) {
  const hr = d.getHours();
  if (hr < 6) return 'Buenas noches';
  if (hr < 14) return 'Buenos días';
  if (hr < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

// ---------- Logotipo de Tabula ----------
// Icono: círculo crema con una T que deja ver el fondo de franjas diagonales y sale por abajo.
let logoSeq = 0;
const LOGO_BANDS = '<rect width="512" height="512" fill="#5A80A3"/><path d="M400 0H512V512H0V400Z" fill="#3E5C76"/><path d="M512 128V512H128Z" fill="#2B4257"/>';
/** Icono de Tabula como <svg> (tamaño en px). Decorativo por defecto. */
export function logoMark(size = 32, { label = null } = {}) {
  const id = `tblogo${++logoSeq}`;
  const a = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  const t = document.createElement('template');
  t.innerHTML = `<svg class="logo-mark" ${a} width="${size}" height="${size}" viewBox="0 0 512 512"><defs><clipPath id="${id}c"><rect width="512" height="512" rx="112"/></clipPath><clipPath id="${id}t"><rect x="227" y="160" width="58" height="400" rx="12"/><rect x="150" y="146" width="212" height="58" rx="12"/></clipPath></defs><g clip-path="url(#${id}c)">${LOGO_BANDS}<circle cx="256" cy="256" r="196" fill="#FAF9F5"/><g clip-path="url(#${id}t)">${LOGO_BANDS}</g></g></svg>`;
  return t.content.firstChild;
}
/** Logotipo completo: icono + nombre. */
export function logoLockup({ size = 32, compact = false } = {}) {
  return h('span', { class: `logo-lockup${compact ? ' compact' : ''}` }, logoMark(size), h('span', { class: 'logo-word' }, 'Tabula'));
}

// ---------- Botón "Iniciar sesión con Google" ----------
const GOOGLE_G = '<svg class="g-logo" aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
/** Botón con el logotipo de Google (estilo neutro, como recomienda Google). */
export function googleButton(onclick, { disabled = false, label = 'Iniciar sesión con Google' } = {}) {
  const t = document.createElement('template');
  t.innerHTML = GOOGLE_G;
  return h('button', { type: 'button', class: 'btn btn-google', disabled, onclick }, t.content.firstChild, label);
}

// ---------- Color estable para etiquetas ----------
/** Devuelve 't1'…'t6' de forma estable para cada nombre de etiqueta (usar con class="chip tN"). */
export function tagClass(name) {
  let n = 0;
  for (const ch of String(name).toLowerCase()) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return 't' + ((n % 6) + 1);
}

// ---------- Avisos (toast) con acción opcional ----------
let toastTimer;
export function toast(message, action) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.replaceChildren(h('span', {}, message));
  if (action) {
    el.append(h('button', { class: 'toast-action', onclick: () => { action.run(); el.classList.remove('show'); } }, action.label));
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

// ---------- Hoja/diálogo modal ----------
/** Abre un panel (lateral en pantallas grandes, hoja inferior en móvil). Devuelve close(). */
export function openSheet(title, content, { onClose } = {}) {
  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener('keydown', onKey);
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title' }, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close }, icon('x'))),
    h('div', { class: 'sheet-body' }, content));
  const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } }, panel);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => {
    overlay.classList.add('open');
    // Foco al primer campo (o al panel) para teclado y lectores de pantalla
    const first = panel.querySelector('.sheet-body input:not([type=hidden]):not([type=checkbox]):not([type=radio]), .sheet-body textarea, .sheet-body select');
    if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
  });
  return close;
}
