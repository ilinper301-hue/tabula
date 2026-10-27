// Tabula · Documentos · pestaña «Biblioteca»
import { store } from '../../store.js';
import { h, icon } from '../../ui.js';
import { filterDocs, facets, kindOf, KINDS } from '../../documents.js';
import { getGroups, getGroup } from '../../school.js';
import { thumb, metaLine } from './common.js';

export const libState = { q: '', carpeta: '', etiqueta: '', kind: '', groupId: '', favoritos: false, sort: 'recientes' };

const SORTS = [['recientes', 'Más recientes'], ['titulo', 'Título (A–Z)'], ['impresos', 'Impresos hace poco']];

/** ctx: { onOpen(id), upload(), link() } — devuelve { el, destroy } */
export function mountLibrary(ctx) {
  const s = libState;

  // Buscador (se crea una sola vez para no perder el foco al escribir)
  const search = h('input', { class: 'input dc-search-input', id: 'dc-search', type: 'search', placeholder: 'Buscar documentos', value: s.q, autocomplete: 'off', 'aria-label': 'Buscar documentos' });
  const sortSel = h('select', { class: 'select dc-sort', 'aria-label': 'Ordenar por' }, ...SORTS.map(([v, l]) => h('option', { value: v, selected: v === s.sort }, l)));
  const pills = h('div', { class: 'dc-pills', role: 'group', 'aria-label': 'Filtros' });
  const gridBox = h('div', { class: 'dc-grid-box' });
  const count = h('p', { class: 'dc-count', 'aria-live': 'polite' });

  const toolbar = h('div', { class: 'dc-toolbar' },
    h('div', { class: 'dc-search' }, icon('search', 18), search), sortSel);

  search.addEventListener('input', () => { s.q = search.value; paintGrid(); paintPills(); });
  sortSel.addEventListener('change', () => { s.sort = sortSel.value; paintGrid(); });

  const hasFilters = () => !!(s.q || s.carpeta || s.etiqueta || s.kind || s.groupId || s.favoritos);
  const clear = () => { Object.assign(s, { q: '', carpeta: '', etiqueta: '', kind: '', groupId: '', favoritos: false }); search.value = ''; paintPills(); paintGrid(); };

  function pillSelect(key, label, options) {
    const active = !!s[key];
    const sel = h('select', { class: 'dc-pill-select', 'aria-label': label },
      h('option', { value: '' }, label),
      ...options.map(([v, l]) => h('option', { value: v, selected: v === s[key] }, l)));
    sel.addEventListener('change', () => { s[key] = sel.value; paintPills(); paintGrid(); });
    return h('label', { class: `dc-pill${active ? ' on' : ''}` }, sel, icon('chevronDown', 14));
  }

  function paintPills() {
    const docs = store.list('documentos');
    if (!docs.length) { pills.replaceChildren(); pills.hidden = true; return; }
    pills.hidden = false;
    const f = facets(docs);
    const kinds = [...new Set(docs.map(kindOf))];
    const groupsUsed = getGroups().filter((g) => docs.some((d) => d.groupId === g.id));
    // Si un filtro apunta a algo que ya no existe, se limpia
    if (s.carpeta && !f.carpetas.some((c) => c.nombre === s.carpeta)) s.carpeta = '';
    if (s.etiqueta && !f.etiquetas.some((c) => c.nombre === s.etiqueta)) s.etiqueta = '';
    const fav = h('button', { type: 'button', class: `dc-pill dc-pill-btn${s.favoritos ? ' on' : ''}`, 'aria-pressed': String(s.favoritos), onclick: () => { s.favoritos = !s.favoritos; paintPills(); paintGrid(); } },
      icon('star', 14), 'Favoritos');
    pills.replaceChildren(...[
      fav,
      f.carpetas.length ? pillSelect('carpeta', 'Carpeta', f.carpetas.map((c) => [c.nombre, `${c.nombre} (${c.n})`])) : null,
      f.etiquetas.length ? pillSelect('etiqueta', 'Etiqueta', f.etiquetas.map((c) => [c.nombre, `${c.nombre} (${c.n})`])) : null,
      kinds.length > 1 ? pillSelect('kind', 'Tipo', kinds.map((k) => [k, KINDS[k].label])) : null,
      groupsUsed.length ? pillSelect('groupId', 'Grupo', groupsUsed.map((g) => [g.id, g.nombre])) : null,
      hasFilters() ? h('button', { type: 'button', class: 'link-btn dc-clear', onclick: clear }, 'Quitar filtros') : null].filter(Boolean));
  }

  function card(d) {
    const g = d.groupId ? getGroup(d.groupId) : null;
    return h('article', { class: 'dc-card' },
      h('button', { type: 'button', class: 'dc-card-open', 'aria-label': `Abrir ${d.titulo}`, onclick: () => ctx.onOpen(d.id) },
        thumb(d),
        h('span', { class: 'dc-card-body' },
          h('span', { class: 'dc-card-title' }, d.titulo || 'Sin título'),
          h('span', { class: 'dc-card-meta' }, metaLine(d)),
          d.carpeta || g ? h('span', { class: 'dc-card-tags' },
            d.carpeta ? h('span', { class: 'dc-card-folder' }, icon('folder', 12), d.carpeta) : null,
            g ? h('span', { class: 'dc-card-folder' }, g.nombre) : null) : null)),
      h('button', {
        type: 'button', class: 'dc-fav', 'data-fav': d.id, 'aria-pressed': String(!!d.favorito),
        'aria-label': d.favorito ? `Quitar «${d.titulo}» de favoritos` : `Marcar «${d.titulo}» como favorito`,
        title: d.favorito ? 'Quitar de favoritos' : 'Favorito',
        onclick: (e) => { e.stopPropagation(); store.update('documentos', d.id, { favorito: !d.favorito }); },
      }, icon('star', 17)));
  }

  function paintGrid() {
    const all = store.list('documentos');
    const focusedFav = document.activeElement?.dataset?.fav;
    toolbar.hidden = !all.length;
    if (!all.length) {
      count.textContent = '';
      gridBox.replaceChildren(h('div', { class: 'dc-empty' },
        h('div', { class: 'dc-empty-art', 'aria-hidden': 'true' }, icon('documentos', 34), icon('printer', 22)),
        h('h2', { class: 'dc-empty-title' }, 'Tu biblioteca está vacía'),
        h('p', {}, 'Sube fichas, exámenes o presentaciones y tenlos siempre a mano para imprimirlos cuando los necesites.'),
        h('div', { class: 'dc-actions center' },
          h('button', { type: 'button', class: 'btn btn-primary', onclick: ctx.upload }, icon('upload', 16), 'Subir archivos'),
          h('button', { type: 'button', class: 'btn', onclick: ctx.link }, icon('link', 16), 'Añadir enlace')),
        h('p', { class: 'dc-hint' }, 'Los archivos se guardan en este dispositivo y, si has iniciado sesión, también en tu cuenta para verlos en otros.')));
      return;
    }
    const list = filterDocs(all, { ...s, strictGroup: true }, s.sort);
    count.textContent = hasFilters() ? `${list.length} de ${all.length} documentos` : `${all.length} ${all.length === 1 ? 'documento' : 'documentos'}`;
    if (!list.length) {
      gridBox.replaceChildren(h('div', { class: 'dc-empty small' },
        icon('search', 30), h('h2', { class: 'dc-empty-title' }, 'Nada coincide'), h('p', {}, 'Prueba con otras palabras o quita algún filtro.'),
        h('button', { type: 'button', class: 'btn', onclick: clear }, 'Quitar filtros')));
      return;
    }
    gridBox.replaceChildren(h('div', { class: 'dc-grid' }, ...list.map(card)));
    if (focusedFav) gridBox.querySelector(`[data-fav="${focusedFav}"]`)?.focus();
  }

  const el = h('div', { class: 'dc-library' }, toolbar, pills, count, gridBox);
  const repaint = () => { paintPills(); paintGrid(); };
  repaint();
  const unsub = [store.subscribe('documentos', repaint), store.subscribe('groups', paintPills)];
  return { el, destroy: () => unsub.forEach((u) => u()) };
}
