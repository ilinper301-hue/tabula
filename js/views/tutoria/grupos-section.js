// Tabula · Tutoría · sección «Tutoría» para la ficha del alumno en Grupos
import { store } from '../../store.js';
import { h, tagClass } from '../../ui.js';
import { studentFile, MEDIDAS } from '../../tutoria.js';
import { plural, mediumDate, MEDIDA_SHORT } from './common.js';

/** @param close función que cierra la hoja de la ficha al seguir el enlace */
export function tutoriaSection(studentId, close) {
  const s = store.get('students', studentId);
  const reuniones = store.list('reuniones').filter((r) => r.groupId === (s && s.groupId));
  const medidas = store.list('medidas').filter((m) => m.groupId === (s && s.groupId));
  const file = studentFile(studentId, reuniones, medidas);
  const done = file.reuniones.filter((r) => r.estado === 'realizada');
  const activas = file.medidas.filter((m) => m.estado === 'activa');
  return h('section', { class: 'tu-grupos', 'aria-label': 'Tutoría' },
    h('div', { class: 'section-label' }, 'Tutoría'),
    h('p', { class: 'tu-hint tu-grupos-line' }, done.length
      ? `${plural(done.length, 'reunión realizada', 'reuniones realizadas')} · última el ${mediumDate(done[0].fecha)}`
      : 'Sin reuniones realizadas.'),
    activas.length
      ? h('div', { class: 'tu-chips tu-grupos-chips' }, activas.map((m) => h('span', { class: `chip ${tagClass(m.tipo)}`, title: (MEDIDAS[m.tipo] || {}).label || m.tipo },
        MEDIDA_SHORT[m.tipo] || m.tipo)))
      : null,
    h('a', { class: 'link-btn tu-grupos-link', href: `#/tutoria?alumno=${encodeURIComponent(studentId)}`, onclick: () => close && close() }, 'Ver ficha de tutoría'));
}
