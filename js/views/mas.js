// Tabula · «Más»: todas las secciones en cuadrícula (mismos bloques que la barra lateral)

import { h, icon } from '../ui.js';
import { pageHead } from '../ui-kit.js';
import { SECTIONS, AJUSTES, NAV_BLOCKS, APPS_AMIGAS } from '../nav-model.js';
import { openSearch } from './search-ui.js';
import { openBarSheet } from './ajustes/menu.js';

const tile = (id, r) => h('a', { class: 'more-tile', href: `#/${id}` },
  h('span', { class: 'more-icon' }, icon(r.icon, 20)),
  h('span', { class: 'more-label' }, r.label));

export function render(container) {
  container.replaceChildren(
    pageHead({
      eyebrow: 'Todas las secciones', title: 'Más',
      aside: h('button', { type: 'button', class: 'icon-btn more-search', 'aria-label': 'Buscar', 'aria-haspopup': 'dialog', onclick: (e) => openSearch({ from: e.currentTarget }) }, icon('search', 22)),
    }),
    h('nav', { class: 'more-blocks', 'aria-label': 'Más secciones' },
      ...NAV_BLOCKS.map((b) => h('section', { class: 'more-block', 'aria-labelledby': `more-${b.id}` },
        h('h2', { class: 'section-label', id: `more-${b.id}` }, b.label),
        h('div', { class: 'more-grid' }, ...b.items.map((id) => tile(id, SECTIONS[id]))))),
      h('section', { class: 'more-block', 'aria-labelledby': 'more-apps' },
        h('h2', { class: 'section-label', id: 'more-apps' }, 'Apps amigas'),
        h('div', { class: 'more-grid more-apps' }, ...APPS_AMIGAS.map((a) => h('a', { class: 'more-tile', href: a.url, target: '_blank', rel: 'noopener', title: a.desc },
          h('img', { class: 'more-app-ico', src: a.icono, alt: '', width: 28, height: 28 }),
          h('span', { class: 'more-label' }, a.nombre))))),
      h('section', { class: 'more-block', 'aria-labelledby': 'more-ajustes' },
        h('h2', { class: 'section-label', id: 'more-ajustes' }, 'Tabula'),
        h('div', { class: 'more-grid' },
          tile(AJUSTES.id, AJUSTES),
          h('button', { type: 'button', class: 'more-tile', onclick: (e) => openBarSheet({ onSaved: () => e.currentTarget && e.currentTarget.focus() }) },
            h('span', { class: 'more-icon' }, icon('sidebar', 20)),
            h('span', { class: 'more-label' }, 'Barra inferior'))))),
  );
}
