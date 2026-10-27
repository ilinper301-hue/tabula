// Tabula · «En clase» · utilidades compartidas por las herramientas del aula
import { store } from '../../store.js';
import { h, todayISO, fromISO, toISO, toast } from '../../ui.js';
import { getGroups, getGroup, getSessionsForDate, getAttendance, toMin } from '../../school.js';

// ---------- Iconos propios de las herramientas (trazo, heredan currentColor) ----------
const PATHS = {
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/>',
  shuffle: '<path d="M3 7h3.5c3 0 4 2 5.5 5s2.500 5 5.500 5H21M3 17h3.500c1.800 0 2.800-.7 3.700-1.900M14 8.300C14.800 7.500 15.900 7 17.500 7H21M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.500 11a6.500 6.500 0 0 0 13 0M12 17.500V21"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.500"/><path d="M16 8V6.500A2.500 2.500 0 0 0 13.500 4h-7A2.500 2.500 0 0 0 4 6.500v7A2.500 2.500 0 0 0 6.500 16H8"/>',
  swap: '<path d="M4 8h14l-3.500-3.500M20 16H6l3.500 3.500"/>',
  board: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  shield: '<path d="M12 3 5 6v5.500c0 4.300 2.900 7.500 7 9 4.100-1.500 7-4.700 7-9V6z"/><path d="m9.500 12 2 2 3.500-4"/>',
  star: '<path d="m12 3.500 2.600 5.400 5.900.8-4.300 4.100 1 5.900L12 16.900 6.800 19.700l1-5.900-4.300-4.100 5.900-.8z"/>',
};
export function svg(name, size = 22) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return t.content.firstChild;
}

// ---------- Fechas ----------
/** Lunes (ISO) de la semana de una fecha. */
export function mondayOf(iso) {
  const d = fromISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}
export function addDays(iso, n) { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export const shortDate = (iso) => { const d = fromISO(iso); return `${d.getDate()} ${MES[d.getMonth()]}`; };

// ---------- Grupos y ausencias ----------
/** Alumnado ausente en una fecha (F = falta, J = falta justificada). */
export function absentIds(groupId, fecha = todayISO()) {
  const att = getAttendance(groupId, fecha);
  return new Set(Object.entries(att?.registros || {}).filter(([, v]) => v === 'F' || v === 'J').map(([id]) => id));
}

function classSessions() {
  return getSessionsForDate(todayISO()).filter((s) => s.tipo === 'clase' && s.groupId && getGroup(s.groupId) && !getGroup(s.groupId).archivado);
}
function nowMin() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

/** Sesión de clase en curso o, si no, la siguiente de hoy. */
export function currentOrNextSession() {
  const ses = classSessions(); const nm = nowMin();
  return ses.find((s) => toMin(s.inicio) <= nm && nm < toMin(s.fin)) || ses.find((s) => toMin(s.inicio) > nm) || null;
}
/** Grupo por defecto: el de la sesión actual o siguiente de hoy; si no, el primero sin archivar. */
export function defaultGroupId() {
  return currentOrNextSession()?.groupId || getGroups()[0]?.id || null;
}
/** Área sugerida para un grupo: la de su sesión actual/siguiente de hoy, o la última de hoy. */
export function suggestedArea(groupId) {
  const mine = classSessions().filter((s) => s.groupId === groupId);
  const nm = nowMin();
  const s = mine.find((x) => toMin(x.inicio) <= nm && nm < toMin(x.fin)) || mine.find((x) => toMin(x.inicio) > nm) || mine[mine.length - 1];
  return s?.area || '';
}
/** Áreas que el grupo tiene en el horario (sin repetir). */
export function areasOfGroup(groupId) {
  return [...new Set(store.list('schedule').filter((s) => s.tipo === 'clase' && s.groupId === groupId && s.area).map((s) => s.area))];
}

// ---------- Nombres ----------
/** Nombre corto: «María» o «María G.» si hay otro alumno con el mismo nombre. */
export function shortName(s, all) {
  const dup = all.filter((x) => x.id !== s.id && (x.nombre || '').trim().toLowerCase() === (s.nombre || '').trim().toLowerCase()).length > 0;
  return dup && s.apellidos ? `${s.nombre} ${s.apellidos.trim()[0]}.` : s.nombre;
}
export const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Copia texto al portapapeles (con alternativa para navegadores sin permiso). */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); return true; } catch {}
  try {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' }, 'aria-hidden': 'true' }); ta.value = text;
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    toast(ok ? 'Copiado' : 'No se pudo copiar'); return ok;
  } catch { toast('No se pudo copiar'); return false; }
}

/** Interruptor con etiqueta (usa .switch-row de la app). */
export function switchRow(label, checked, onchange, { sub = '' } = {}) {
  const input = h('input', { type: 'checkbox', class: 'switch', checked, onchange: (e) => onchange(e.target.checked) });
  return h('label', { class: 'switch-row au-switch' }, h('span', {}, label, sub ? h('small', { class: 'au-sub' }, sub) : null), input);
}
