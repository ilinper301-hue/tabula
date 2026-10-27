// Tabula · Grupos · utilidades comunes a las pestañas y hojas del módulo
import { store } from '../../store.js';
import { h } from '../../ui.js';
import { getStudents, fullName, initials } from '../../school.js';
import { compareStudents } from './parse-students.js';

export const COLORS = ['t1', 't2', 't3', 't4', 't5', 't6'];
export const COLOR_NAMES = { t1: 'Terracota', t2: 'Azul', t3: 'Verde', t4: 'Violeta', t5: 'Ocre', t6: 'Turquesa' };
export const colorOf = (g) => (g && COLORS.includes(g.color) ? g.color : 't1');
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Texto sin tildes ni mayúsculas, para buscar. */
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Círculo con las iniciales, coloreado con el color del grupo. */
export const avatar = (student, color) =>
  h('span', { class: `gr-avatar gr-c-${color}`, 'aria-hidden': 'true' }, initials(student));

/** Navega a una ruta de Grupos: go({id, tab, fecha}). */
export function go(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const q = p.toString();
  location.hash = q ? `#/grupos?${q}` : '#/grupos';
}

/** Mantiene `orden` = posición alfabética (apellidos, nombre) dentro del grupo. */
export function reorderStudents(groupId) {
  const sorted = getStudents(groupId).sort(compareStudents);
  sorted.forEach((s, i) => { if (s.orden !== i) store.update('students', s.id, { orden: i }); });
}

export { fullName };
