// Tabula · «Más»: menú completo en el móvil (mismos bloques que la barra lateral)

import { h, icon } from '../ui.js';
import { SECTIONS, AJUSTES, NAV_BLOCKS, APPS_AMIGAS } from '../nav-model.js';
import { openSearch } from './search-ui.js';
import { openBarSheet } from './ajustes/menu.js';

const item = (id, r) => h('a', { class: 'more-item', href: `#/${id}` },
  h('span', { class: 'more-icon' }, icon(r.icon, 20)),
  h('span', { class: 'more-text' }, h('span', { class: 'more-label' }, r.label), h('span', { class: 'more-desc' }, r.desc)),
  icon('chevronRight', 18, 'more-chevron'));

export function render(container) {
  container.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', {}, h('h1', { class: 'page-title' }, 'Más')),
      h('button', { type: 'button', class: 'icon-btn more-search', 'aria-label': 'Buscar', 'aria-haspopup': 'dialog', onclick: (e) => openSearch({ from: e.currentTarget }) }, icon('search', 22))),
    h('nav', { class: 'more-blocks', 'aria-label': 'Más secciones' },
      ...NAV_BLOCKS.map((b) => h('section', { class: 'more-block', 'aria-labelledby': `more-${b.id}` },
        h('h2', { class: 'section-label', id: `more-${b.id}` }, b.label),
        h('div', { class: 'card more-list' }, ...b.items.map((id) => item(id, SECTIONS[id]))))),
      h('section', { class: 'more-block', 'aria-labelledby': 'more-apps' },
        h('h2', { class: 'section-label', id: 'more-apps' }, 'Apps amigas'),
        h('div', { class: 'card more-list' }, ...APPS_AMIGAS.map((a) => h('a', { class: 'more-item', href: a.url, target: '_blank', rel: 'noopener' },
          h('img', { class: 'more-app-ico', src: a.icono, alt: '', width: 36, height: 36 }),
          h('span', { class: 'more-text' }, h('span', { class: 'more-label' }, a.nombre), h('span', { class: 'more-desc' }, a.desc)),
          icon('external', 16, 'more-chevron'))))),
      h('section', { class: 'more-block', 'aria-labelledby': 'more-ajustes' },
        h('h2', { class: 'section-label', id: 'more-ajustes' }, 'Tabula'),
        h('div', { class: 'card more-list' },
          item(AJUSTES.id, AJUSTES),
          h('button', { type: 'button', class: 'more-item more-action', onclick: (e) => openBarSheet({ onSaved: () => e.currentTarget && e.currentTarget.focus() }) },
            h('span', { class: 'more-icon' }, icon('sidebar', 20)),
            h('span', { class: 'more-text' }, h('span', { class: 'more-label' }, 'Personalizar barra'), h('span', { class: 'more-desc' }, 'Elige los 4 accesos de la barra inferior')),
            icon('chevronRight', 18, 'more-chevron'))))),
  );
}
