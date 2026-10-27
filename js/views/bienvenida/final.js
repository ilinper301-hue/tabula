// Pantalla final · «Todo listo»: resumen y siguientes pasos
import { store } from '../../store.js';
import { h, icon } from '../../ui.js';
import { getStudents } from '../../school.js';
import { plural } from '../grupos/common.js';

export function finalScreen(ctx) {
  const group = ctx.st.groupId ? store.get('groups', ctx.st.groupId) : null;
  const students = group ? getStudents(group.id).length : 0;
  const clases = group ? store.list('schedule').filter((s) => s.groupId === group.id && s.tipo === 'clase').length : 0;

  const stat = (value, label) => h('div', { class: 'bv-stat' }, h('strong', {}, String(value)), h('span', {}, label));
  const summary = group
    ? h('div', { class: 'bv-summary' },
      h('div', { class: 'bv-summary-group' }, icon('grupos', 20), h('strong', {}, group.nombre)),
      h('div', { class: 'bv-stats' },
        stat(students, students === 1 ? 'alumno' : 'alumnos'),
        stat(clases, clases === 1 ? 'clase a la semana' : 'clases a la semana')))
    : h('div', { class: 'bv-summary' }, h('p', { class: 'bv-hint' }, 'Todavía no has creado ningún grupo. Puedes hacerlo cuando quieras desde Grupos.'));

  const q = encodeURIComponent;
  const suggestions = group
    ? [['Pasar lista hoy', 'Marca quién ha venido en dos toques.', `#/grupos?id=${q(group.id)}&tab=asistencia`, 'check'],
      ['Crear tu primer cuaderno', 'Notas y actividades de tu grupo.', `#/cuaderno?grupo=${q(group.id)}`, 'cuaderno'],
      ['Planificar una situación de aprendizaje', 'Organiza tus sesiones por áreas.', `#/planificacion?grupo=${q(group.id)}`, 'planificacion']]
    : [['Crear tu primer grupo', 'Es el punto de partida de todo lo demás.', '#/grupos', 'grupos']];

  const el = h('div', { class: 'bv-form' }, summary,
    h('h2', { class: 'bv-sub' }, 'Por dónde seguir'),
    h('ul', { class: 'bv-suggest' }, suggestions.map(([t, d, href, ic]) => h('li', {},
      h('a', { href }, h('span', { class: 'bv-suggest-ic' }, icon(ic, 20)),
        h('span', { class: 'bv-suggest-tx' }, h('strong', {}, t), h('span', {}, d)),
        icon('chevronRight', 18))))));

  return {
    title: 'Todo listo',
    lead: group ? `Ya tienes tu grupo${students ? ` con ${plural(students, 'alumno', 'alumnos')}` : ''}. Tabula está lista para empezar.` : 'Tabula está lista para empezar.',
    el, final: true,
  };
}
