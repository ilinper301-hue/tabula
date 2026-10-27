// Tabula · Planes y programas · utilidades comunes a las pestañas, hojas y a «Hoy»
import { h } from '../../ui.js';

export const COLORS = ['t1', 't2', 't3', 't4', 't5', 't6'];
export const COLOR_NAMES = { t1: 'Terracota', t2: 'Azul', t3: 'Verde', t4: 'Violeta', t5: 'Ocre', t6: 'Turquesa' };
export const colorOf = (p) => (p && COLORS.includes(p.color) ? p.color : 't3');
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
/** Texto sin tildes ni mayúsculas, para comparar y buscar. */
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Navega a una ruta de Planes y programas: go({id, tab}). */
export function go(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const q = p.toString();
  location.hash = q ? `#/programas?${q}` : '#/programas';
}
export const hrefTo = (params) => `#/programas?${new URLSearchParams(params)}`;

let fieldN = 0;
/** Campo etiquetado: field('Nombre', input, 'ayuda') */
export function field(label, control, hint) {
  const id = control.id || (control.id = `pg-f${++fieldN}`);
  return h('div', { class: 'field' }, h('label', { for: id }, label), control,
    hint ? h('span', { class: 'pg-hint' }, hint) : null);
}

/** Valida http/https. Devuelve la URL normalizada o null. */
export function cleanUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

/** Enlace externo seguro. */
export const extLink = (url, text, cls = 'pg-link') =>
  h('a', { class: cls, href: url, target: '_blank', rel: 'noopener noreferrer' }, text || url);

/**
 * Ejecuta `paint` ahora, salvo que el usuario esté escribiendo en un campo dentro de `root`:
 * en ese caso lo aplaza hasta que salga del campo (así un cambio externo no le quita el foco).
 */
export function safePainter(root, paint) {
  let pending = false;
  const typing = () => {
    const a = document.activeElement;
    return a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox';
  };
  root.addEventListener('focusout', () => {
    if (pending) setTimeout(() => { if (pending && !typing()) { pending = false; paint(); } }, 0);
  });
  return () => { if (typing()) pending = true; else { pending = false; paint(); } };
}

/** Descarga un texto como archivo. */
export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Copia texto al portapapeles (con alternativa para navegadores sin API). */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* se prueba el método clásico */ }
  const ta = h('textarea', { 'aria-hidden': 'true', style: { position: 'fixed', top: '0', left: '0', opacity: '0' } });
  ta.value = text;
  document.body.append(ta); ta.focus(); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

// ---------- «Hoy»: relacionar una sesión del horario con un programa ----------
const STOP = new Set(['plan', 'programa', 'proyecto', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'para', 'con',
  'escolar', 'escolares', 'centro', 'educativo', 'educativa', 'coordinacion']);
/** Palabras significativas, con stem≈steam y plurales simples unificados. */
function keyWords(text) {
  return norm(text).split(/[^a-zñ0-9]+/).filter(Boolean)
    .map((w) => (/^st(e|ea)m$/.test(w) ? 'steam' : w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
}
/** ¿El título de la sesión contiene «coord»? */
export const isCoordSession = (session) => norm(session?.titulo).includes('coord');

/**
 * Devuelve el programa al que parece corresponder una sesión «otro» del horario, o null.
 * Coincide si el título contiene el nombre del programa o alguna de sus palabras clave
 * (sin cifras ni palabras genéricas como «plan»); «STEM» se considera igual que «STEAM».
 */
export function matchProgramForSession(session, programs) {
  const title = norm(session?.titulo);
  if (!title || !programs?.length) return null;
  const titleWords = new Set(keyWords(session.titulo));
  const scored = [];
  for (const p of programs) {
    if (norm(p.nombre) && title.includes(norm(p.nombre))) { scored.push([3, p]); continue; }
    const keys = keyWords(p.nombre).filter((w) => !STOP.has(w) && !/^\d+$/.test(w) && w.length >= 3);
    const useKeys = keys.length ? keys : keyWords(p.nombre).filter((w) => w.length >= 3 && !/^\d+$/.test(w)).slice(0, 1);
    if (useKeys.some((k) => titleWords.has(k))) scored.push([p.rol === 'coordinador' ? 2 : 1, p]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored[0] ? scored[0][1] : null;
}

