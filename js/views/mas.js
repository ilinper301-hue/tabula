// Tabula · "Más": acceso en el móvil a las secciones que no caben en la barra inferior

import { h, icon } from '../ui.js';

const ITEMS = [
  { id: 'aula', label: 'En clase', icon: 'aula', desc: 'Temporizador, al azar, grupos y ruido' },
  { id: 'tutoria', label: 'Tutoría', icon: 'tutoria', desc: 'Familias, reuniones y atención a la diversidad' },
  { id: 'cuaderno', label: 'Cuaderno', icon: 'cuaderno', desc: 'Notas y evaluación' },
  { id: 'planificacion', label: 'Planificación', icon: 'planificacion', desc: 'Situaciones de aprendizaje y sesiones' },
  { id: 'programas', label: 'Planes y programas', icon: 'programas', desc: 'Diario de coordinación y memorias' },
  { id: 'encuestas', label: 'Encuestas', icon: 'encuestas', desc: 'Pregunta a tus compañeros con un enlace' },
  { id: 'documentos', label: 'Documentos', icon: 'documentos', desc: 'Fichas, archivos y cola de impresión' },
  { id: 'ajustes', label: 'Ajustes', icon: 'ajustes', desc: 'Perfil, cuenta, evaluación y copias' },
];

export function render(container) {
  container.replaceChildren(
    h('header', { class: 'page-head' }, h('div', {}, h('h1', { class: 'page-title' }, 'Más'))),
    h('nav', { class: 'card more-list', 'aria-label': 'Más secciones' },
      ...ITEMS.map((it) => h('a', { class: 'more-item', href: `#/${it.id}` },
        h('span', { class: 'more-icon' }, icon(it.icon, 20)),
        h('span', { class: 'more-text' }, h('span', { class: 'more-label' }, it.label), h('span', { class: 'more-desc' }, it.desc)),
        icon('chevronRight', 18, 'more-chevron')))),
  );
}
