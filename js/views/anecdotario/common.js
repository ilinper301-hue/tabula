// Tabula · Anecdotario · utilidades comunes (sin efectos al importar)
import { h, relativeDay, MESES } from '../../ui.js';
import { OBS_TYPES, evaluationRange } from '../../observations.js';
import { currentSchoolYear } from '../../school.js';

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Orden fijo de los tipos en la interfaz. */
export const TYPE_ORDER = ['positiva', 'negativa', 'neutra'];

/** Año en que empieza el curso escolar de un grupo ("2026-27" → 2026). */
export function startYear(group) {
  const m = /^(\d{4})/.exec((group && group.cursoEscolar) || currentSchoolYear());
  return m ? Number(m[1]) : new Date().getFullYear();
}

/** Rango de fechas de una evaluación ('1','2','3') o de todo el curso (cualquier otro valor). */
export const rangeFor = (group, ev) => evaluationRange(ev, startYear(group));

/** Nombre corto para botones: nombre de pila (+ inicial del apellido si hay otro igual en el grupo). */
export function shortName(student, all) {
  const first = (student.nombre || '').trim().split(/\s+/)[0] || '?';
  const dup = all.some((o) => o.id !== student.id && (o.nombre || '').trim().split(/\s+/)[0] === first);
  const ap = (student.apellidos || '').trim()[0];
  return dup && ap ? `${first} ${ap.toUpperCase()}.` : first;
}

/** Texto accesible de un recuento: "3 positivas, 1 a mejorar, 2 notas". */
export const tallyText = (t) => [
  t.positiva ? plural(t.positiva, 'positiva', 'positivas') : null,
  t.negativa ? `${t.negativa} a mejorar` : null,
  t.neutra ? plural(t.neutra, 'nota', 'notas') : null,
].filter(Boolean).join(', ') || 'Sin observaciones';

/**
 * Recuento compacto "+3 −1 ·2". Por defecto omite los ceros y el neutro (`neutral: true` lo incluye).
 * Devuelve null si no hay nada que mostrar.
 */
export function tallyEl(t, { neutral = false, cls = '' } = {}) {
  if (!t) return null;
  const parts = [];
  if (t.positiva) parts.push(h('span', { class: 'ao-n ao-pos', 'aria-hidden': 'true' }, `+${t.positiva}`));
  if (t.negativa) parts.push(h('span', { class: 'ao-n ao-neg', 'aria-hidden': 'true' }, `−${t.negativa}`));
  if (neutral && t.neutra) parts.push(h('span', { class: 'ao-n ao-neu', 'aria-hidden': 'true' }, `·${t.neutra}`));
  if (!parts.length) return null;
  return h('span', { class: `ao-tally ${cls}`, role: 'img', 'aria-label': tallyText(t) }, ...parts);
}

/** Signo con color del tipo, en círculo. */
export const signBadge = (tipo) =>
  h('span', { class: `ao-sign ao-t-${tipo}`, 'aria-hidden': 'true' }, (OBS_TYPES[tipo] || OBS_TYPES.neutra).sign);

/** "Hoy · 10:05" / "26 oct · 10:05" */
export const whenLabel = (o) => [relativeDay(o.fecha), o.hora].filter(Boolean).join(' · ');

/** "Octubre 2026" a partir de "2026-10-26". */
export function monthLabel(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${cap(MESES[m - 1])} ${y}`;
}

/** Texto principal de una observación para listas compactas. */
export const obsTitle = (o) => o.etiqueta || (o.texto ? o.texto : (OBS_TYPES[o.tipo] || OBS_TYPES.neutra).label);

/** Icono de micrófono (no existe en ui.js; marcado estático, sin texto de usuario). */
export function micIcon(size = 20) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
  return t.content.firstChild;
}

/** Icono de lápiz (editar). */
export function pencilIcon(size = 16) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>`;
  return t.content.firstChild;
}
