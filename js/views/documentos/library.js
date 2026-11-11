// Tabula · Documentos · pestaña «Biblioteca»
//
// Buscador a todo el ancho + botón «Filtros» (hoja con orden, favoritos, carpeta, etiqueta, tipo y grupo).
// Bajo el buscador solo se ven las píldoras de los filtros activos, cada una con ✕.
// Selección: pulsación larga en una tarjeta o «⋯ → Seleccionar» (cabecera). La barra inferior ofrece
// «Imprimir juntos» y «Eliminar»; las acciones están en SEL_ACTIONS para poder añadir más.
import { store } from '../../store.js';
import { h, icon, toast, openSheet } from '../../ui.js';
import { filterDocs, facets, kindOf, KINDS, SORTS, DEFAULT_SORT, activeFilters, clearFilter, toggleOrdered } from '../../documents.js';
import { getGroups, getGroup } from '../../school.js';
import { thumb, metaLine, plural } from './common.js';
import { pendingFileIds, uploadPending, onPendingChange } from '../../files.js';
import { cloud, onSyncChange } from '../../sync.js';
import { canCombine } from '../../combine-model.js';
import { openCombineSheet } from './combine.js';
import { deleteDocsWithUndo } from './detail.js';

export const libState = { q: '', carpeta: '', etiqueta: '', kind: '', groupId: '', favoritos: false, sort: DEFAULT_SORT };

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10; // px: si el dedo se mueve más, es desplazamiento y no pulsación larga

/** ctx: { onOpen(id), add() } — devuelve { el, destroy, select() } */
export function mountLibrary(ctx) {
  const s = libState;
  const groupName = (id) => getGroup(id)?.nombre || '';

  // ---------- Buscador y filtros ----------
  // (el buscador se crea una sola vez para no perder el foco al escribir)
  const search = h('input', { class: 'input dc-search-input', id: 'dc-search', type: 'search', placeholder: 'Buscar documentos', value: s.q, autocomplete: 'off', 'aria-label': 'Buscar documentos' });
  const filterBadge = h('span', { class: 'dc-badge', hidden: true });
  const filterBtn = h('button', { type: 'button', class: 'btn dc-filter-btn', 'aria-haspopup': 'dialog', onclick: () => openFilters() },
    icon('filter', 18), h('span', {}, 'Filtros'), filterBadge);
  const toolbar = h('div', { class: 'dc-toolbar' }, h('div', { class: 'dc-search' }, icon('search', 18), search), filterBtn);
  const pills = h('div', { class: 'dc-pills', role: 'group', 'aria-label': 'Filtros activos', hidden: true });
  const gridBox = h('div', { class: 'dc-grid-box' });
  const count = h('p', { class: 'dc-count', 'aria-live': 'polite' });

  search.addEventListener('input', () => { s.q = search.value; paintGrid(); });

  const setFilters = (next) => { Object.assign(s, next); paintPills(); paintGrid(); };
  const clearAll = () => { s.q = ''; search.value = ''; setFilters(clearFilter(s, 'all')); };
  const filtersNow = () => activeFilters(s, { group: groupName });

  /** Si un filtro apunta a algo que ya no existe (carpeta vaciada, grupo borrado…), se quita. */
  function pruneFilters(docs) {
    const f = facets(docs);
    if (s.carpeta && !f.carpetas.some((c) => c.nombre === s.carpeta)) s.carpeta = '';
    if (s.etiqueta && !f.etiquetas.some((c) => c.nombre === s.etiqueta)) s.etiqueta = '';
    if (s.groupId && !getGroup(s.groupId)) s.groupId = '';
  }

  function paintPills() {
    pruneFilters(store.list('documentos'));
    const act = filtersNow();
    filterBadge.hidden = !act.length;
    filterBadge.textContent = String(act.length);
    filterBtn.setAttribute('aria-label', act.length ? `Filtros: ${plural(act.length, 'activo', 'activos')}` : 'Filtros y orden');
    filterBtn.classList.toggle('on', !!act.length);
    pills.hidden = !act.length;
    const focusKey = document.activeElement?.dataset?.pill;
    pills.replaceChildren(...[...act.map((f) => h('button', {
      type: 'button', class: 'dc-pill', dataset: { pill: f.key }, 'aria-label': `Quitar filtro ${f.label}`, title: 'Quitar este filtro',
      onclick: () => {
        setFilters(clearFilter(s, f.key));
        // El foco pasa a la píldora siguiente (o al botón «Filtros» si no queda ninguna)
        (pills.querySelector('.dc-pill') || filterBtn).focus();
      },
    }, h('span', { class: 'dc-pill-text' }, f.label), icon('x', 14))),
    act.length > 1 ? h('button', { type: 'button', class: 'link-btn dc-clear', onclick: () => { setFilters(clearFilter(s, 'all')); filterBtn.focus(); } }, 'Quitar todos') : null].filter(Boolean));
    if (focusKey) pills.querySelector(`[data-pill="${focusKey}"]`)?.focus();
  }

  // ---------- Hoja «Filtros» ----------
  function openFilters() {
    const docs = store.list('documentos');
    const f = facets(docs);
    const kinds = [...new Set(docs.map(kindOf))];
    const groups = getGroups().filter((g) => docs.some((d) => d.groupId === g.id));
    const result = h('p', { class: 'dc-filters-result', role: 'status', 'aria-live': 'polite' });
    const seeBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => close() });

    const sortBox = h('div', { class: 'dc-date-chips', role: 'group', 'aria-labelledby': 'dc-flt-sort' });
    const paintSort = () => sortBox.replaceChildren(...SORTS.map(([v, l]) => h('button', {
      type: 'button', class: `dc-chip-btn${s.sort === v ? ' on' : ''}`, 'aria-pressed': String(s.sort === v),
      onclick: () => { setFilters({ sort: v }); paintSort(); paintResult(); },
    }, l)));

    const fav = h('input', { type: 'checkbox', class: 'switch', checked: !!s.favoritos, 'aria-label': 'Solo favoritos' });
    fav.addEventListener('change', () => { setFilters({ favoritos: fav.checked }); paintResult(); });

    const select = (key, id, label, all, options, empty) => {
      if (!options.length) return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), h('p', { class: 'dc-hint' }, empty));
      const sel = h('select', { class: 'select', id },
        h('option', { value: '' }, all), ...options.map(([v, l]) => h('option', { value: v, selected: v === s[key] }, l)));
      sel.addEventListener('change', () => { setFilters({ [key]: sel.value }); paintResult(); });
      return h('div', { class: 'field' }, h('label', { for: id }, label), sel);
    };

    function paintResult() {
      const all = store.list('documentos');
      const n = filterDocs(all, { ...s, strictGroup: true }, s.sort).length;
      result.textContent = n === all.length ? `Se ven todos (${plural(n, 'documento', 'documentos')})` : `Se ven ${n} de ${all.length} documentos`;
      seeBtn.textContent = n ? `Ver ${plural(n, 'documento', 'documentos')}` : 'Cerrar';
    }

    const body = h('div', { class: 'dc-filters' },
      h('div', { class: 'field' }, h('span', { class: 'field-label', id: 'dc-flt-sort' }, 'Ordenar por'), sortBox),
      h('label', { class: 'switch-row dc-switch-row' },
        h('span', {}, h('strong', { class: 'dc-sw-label' }, 'Solo favoritos'), h('small', { class: 'dc-hint' }, 'Los marcados con la estrella')), fav),
      select('carpeta', 'dc-flt-carpeta', 'Carpeta', 'Todas las carpetas', f.carpetas.map((c) => [c.nombre, `${c.nombre} (${c.n})`]),
        'Aún no hay carpetas: se ponen en la ficha de cada documento, en «Detalles».'),
      select('etiqueta', 'dc-flt-etiqueta', 'Etiqueta', 'Todas las etiquetas', f.etiquetas.map((c) => [c.nombre, `${c.nombre} (${c.n})`]),
        'Aún no hay etiquetas: se ponen en la ficha de cada documento, en «Detalles».'),
      select('kind', 'dc-flt-kind', 'Tipo', 'Todos los tipos', kinds.map((k) => [k, KINDS[k].label]), ''),
      select('groupId', 'dc-flt-group', 'Grupo', 'Todos los grupos', groups.map((g) => [g.id, g.nombre]),
        'Ningún documento tiene grupo todavía.'),
      result,
      h('div', { class: 'dc-actions dc-filters-foot' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { setFilters(clearFilter(s, 'all')); close(); filterBtn.focus(); } }, 'Quitar filtros'),
        seeBtn));
    paintSort(); paintResult();
    const close = openSheet('Filtros', body, { className: 'dc-filters-sheet', onClose: () => { const a = document.activeElement; if (filterBtn.isConnected && (!a || a === document.body || a.closest('.overlay'))) filterBtn.focus({ preventScroll: true }); } });
    requestAnimationFrame(() => sortBox.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true }));
  }

  // ---------- Selección (null = sin seleccionar). El orden de los toques es el orden de impresión ----------
  let sel = null;
  let suppressClick = false; // el «click» que llega al soltar tras una pulsación larga no debe deseleccionar
  const selText = h('span', { class: 'dc-selbar-text', 'aria-live': 'polite' });
  const selActions = h('div', { class: 'dc-selbar-actions' });
  const selBar = h('div', { class: 'dc-selbar', role: 'region', 'aria-label': 'Selección de documentos', hidden: true },
    h('div', { class: 'dc-selbar-top' },
      h('button', { type: 'button', class: 'icon-btn dc-selbar-close', 'aria-label': 'Salir de la selección', title: 'Salir de la selección', onclick: () => setSelecting(false, { focus: true }) }, icon('x', 20)),
      selText),
    selActions);

  /** Acciones de la barra de selección (para añadir otra, p. ej. «Mover a carpeta», basta con otra entrada). */
  const SEL_ACTIONS = [
    {
      id: 'delete', icon: 'trash', label: 'Eliminar', className: 'btn-ghost btn-danger',
      enabled: (docs) => docs.length > 0,
      run: (docs) => confirmDelete(docs),
    },
    {
      id: 'print', icon: 'printer', label: 'Imprimir juntos', className: 'btn-primary',
      enabled: (docs) => docs.some(canCombine),
      title: (docs) => (docs.length && !docs.some(canCombine) ? 'Solo se pueden imprimir juntos PDF, imágenes y fichas' : null),
      run: (docs) => openCombineSheet(docs.map((d) => d.id), { onPrinted: () => setSelecting(false) }),
    },
  ];

  function setSelecting(on, { first = null, focus = false } = {}) {
    sel = on ? (first ? [first] : []) : null;
    paintSel(); paintGrid();
    if (on && focus) (gridBox.querySelector(first ? `[data-key="open-${first}"]` : '.dc-card-open') || selBar.querySelector('button'))?.focus();
    if (!on && focus) gridBox.querySelector('.dc-card-open')?.focus();
  }

  function paintSel() {
    selBar.hidden = !sel;
    gridBox.classList.toggle('is-selecting', !!sel);
    if (!sel) return;
    const docs = sel.map((id) => store.get('documentos', id)).filter(Boolean);
    const n = docs.length;
    selText.textContent = n ? `${n} ${n === 1 ? 'seleccionado' : 'seleccionados'}` : 'Toca los documentos en el orden en que quieras imprimirlos';
    selActions.replaceChildren(...SEL_ACTIONS.map((a) => h('button', {
      type: 'button', class: `btn ${a.className || ''}`, disabled: !a.enabled(docs), title: a.title ? a.title(docs) : null, dataset: { act: a.id },
      onclick: () => a.run(sel.map((id) => store.get('documentos', id)).filter(Boolean)),
    }, icon(a.icon, 16), a.label)));
  }

  function toggleSel(d) {
    sel = toggleOrdered(sel, d.id);
    paintSel(); paintGrid();
  }

  function confirmDelete(docs) {
    const n = docs.length;
    const body = h('div', { class: 'dc-confirm-del' },
      h('p', {}, n === 1 ? `¿Eliminar «${docs[0].titulo}»?` : `¿Eliminar ${n} documentos?`),
      h('p', { class: 'dc-hint' }, 'También se quitan de la cola «Para imprimir». Podrás deshacerlo durante unos segundos.'),
      h('div', { class: 'dc-actions end' },
        h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
        h('button', { type: 'button', class: 'btn btn-primary dc-danger-solid', onclick: () => { close(); setSelecting(false); deleteDocsWithUndo(docs); } }, icon('trash', 16), 'Sí, eliminar')));
    const close = openSheet(n === 1 ? 'Eliminar documento' : 'Eliminar documentos', body, { className: 'dc-confirm-sheet' });
    requestAnimationFrame(() => body.querySelector('button')?.focus({ preventScroll: true }));
  }

  // ---------- Tarjetas ----------
  let lastPointer = 'mouse';
  function bindLongPress(card, d) {
    let timer = null, sx = 0, sy = 0;
    const cancel = () => { clearTimeout(timer); timer = null; card.classList.remove('is-pressing'); };
    card.addEventListener('pointerdown', (e) => {
      lastPointer = e.pointerType || 'mouse';
      suppressClick = false;
      if (sel || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('.dc-fav')) return;
      sx = e.clientX; sy = e.clientY;
      card.classList.add('is-pressing');
      timer = setTimeout(() => {
        timer = null; card.classList.remove('is-pressing');
        suppressClick = true;
        try { navigator.vibrate && navigator.vibrate(12); } catch {}
        setSelecting(true, { first: d.id, focus: true });
      }, LONG_PRESS_MS);
    });
    card.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > MOVE_TOLERANCE) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => card.addEventListener(ev, cancel));
    // En móvil, la pulsación larga abre el menú del sistema (imagen, enlace…): aquí no
    card.addEventListener('contextmenu', (e) => { if (lastPointer !== 'mouse' || suppressClick) e.preventDefault(); });
  }

  function card(d) {
    const g = d.groupId ? getGroup(d.groupId) : null;
    const pos = sel ? sel.indexOf(d.id) : -1;
    const el = h('article', { class: `dc-card${pos >= 0 ? ' is-sel' : ''}` },
      h('button', {
        type: 'button', class: 'dc-card-open', dataset: { key: `open-${d.id}` },
        'aria-label': sel ? `${pos >= 0 ? `Quitar de la selección (n.º ${pos + 1})` : 'Seleccionar'}: ${d.titulo}` : `Abrir ${d.titulo}`,
        'aria-pressed': sel ? String(pos >= 0) : null,
        onclick: () => {
          if (suppressClick) { suppressClick = false; return; }
          if (sel) toggleSel(d); else ctx.onOpen(d.id);
        },
      },
        thumb(d),
        h('span', { class: 'dc-card-body' },
          h('span', { class: 'dc-card-title' }, d.titulo || 'Sin título'),
          h('span', { class: 'dc-card-meta' }, metaLine(d)),
          d.carpeta || g ? h('span', { class: 'dc-card-tags' },
            d.carpeta ? h('span', { class: 'dc-card-folder' }, icon('folder', 12), d.carpeta) : null,
            g ? h('span', { class: 'dc-card-folder' }, g.nombre) : null) : null)),
      sel ? h('span', { class: 'dc-selmark', 'aria-hidden': 'true' }, pos >= 0 ? String(pos + 1) : '') : h('button', {
        type: 'button', class: 'dc-fav', dataset: { key: `fav-${d.id}` }, 'aria-pressed': String(!!d.favorito),
        'aria-label': d.favorito ? `Quitar «${d.titulo}» de favoritos` : `Marcar «${d.titulo}» como favorito`,
        title: d.favorito ? 'Quitar de favoritos' : 'Favorito',
        onclick: (e) => { e.stopPropagation(); store.update('documentos', d.id, { favorito: !d.favorito }); },
      }, icon('star', 17)));
    bindLongPress(el, d);
    return el;
  }

  function paintGrid() {
    const all = store.list('documentos');
    const focusKey = gridBox.contains(document.activeElement) ? document.activeElement.dataset?.key : null;
    toolbar.hidden = !all.length;
    if (!all.length) {
      if (sel) { sel = null; paintSel(); }
      count.textContent = '';
      pills.hidden = true;
      gridBox.replaceChildren(h('div', { class: 'dc-empty' },
        h('div', { class: 'dc-empty-art', 'aria-hidden': 'true' }, icon('documentos', 34), icon('printer', 22)),
        h('h2', { class: 'dc-empty-title' }, 'Tu biblioteca está vacía'),
        h('p', {}, 'Guarda fichas, exámenes o enlaces y tenlos siempre a mano para imprimirlos cuando los necesites.'),
        h('button', { type: 'button', class: 'btn btn-primary', 'aria-haspopup': 'dialog', onclick: ctx.add }, icon('plus', 17), 'Añadir'),
        h('p', { class: 'dc-hint' }, 'También puedes arrastrar o pegar archivos aquí. Se guardan en este dispositivo y, si has iniciado sesión, en tu cuenta.')));
      return;
    }
    if (sel) {
      const before = sel.length;
      sel = sel.filter((id) => all.some((d) => d.id === id));
      if (sel.length !== before) paintSel();
    }
    const list = filterDocs(all, { ...s, strictGroup: true }, s.sort);
    const filtered = !!(s.q || filtersNow().some((f) => f.key !== 'sort'));
    count.textContent = filtered ? `${list.length} de ${all.length} documentos` : plural(all.length, 'documento', 'documentos');
    if (!list.length) {
      gridBox.replaceChildren(h('div', { class: 'dc-empty small' },
        icon('search', 30), h('h2', { class: 'dc-empty-title' }, 'Nada coincide'), h('p', {}, 'Prueba con otras palabras o quita algún filtro.'),
        h('button', { type: 'button', class: 'btn', onclick: clearAll }, 'Quitar filtros')));
      return;
    }
    gridBox.replaceChildren(h('div', { class: 'dc-grid' }, ...list.map(card)));
    if (focusKey) gridBox.querySelector(`[data-key="${focusKey}"]`)?.focus();
  }

  // Archivos de este dispositivo que aún no están en la cuenta (otros dispositivos no podrían abrirlos)
  const pendingBox = h('div', { class: 'dc-pending', role: 'status', hidden: true });
  let uploadingNow = false;
  async function paintPending() {
    const ids = new Set(await pendingFileIds());
    const n = store.list('documentos').filter((d) => d.fileId && ids.has(d.fileId)).length;
    pendingBox.hidden = !n || !store.getSetting('syncUid');
    if (pendingBox.hidden) return;
    pendingBox.replaceChildren(icon('upload', 16),
      h('span', {}, uploadingNow ? `Subiendo ${n === 1 ? '1 archivo' : `${n} archivos`} a tu cuenta…`
        : `${n === 1 ? '1 archivo aún no está' : `${n} archivos aún no están`} en tu cuenta: en otros dispositivos no se podrán abrir.`),
      uploadingNow || !cloud() ? '' : h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => {
        uploadingNow = true; paintPending();
        try { await uploadPending(); } finally { uploadingNow = false; paintPending(); }
      } }, 'Subir ahora'));
  }

  // Escape sale de la selección (si no hay una hoja o un menú abiertos encima)
  const onKey = (e) => {
    if (e.key !== 'Escape' || !sel || document.querySelector('.overlay, .menu')) return;
    e.preventDefault(); setSelecting(false, { focus: true });
  };
  document.addEventListener('keydown', onKey);

  const el = h('div', { class: 'dc-library' }, pendingBox, toolbar, pills, count, gridBox, selBar);
  const repaint = () => { paintPills(); paintGrid(); paintSel(); paintPending(); };
  repaint();
  uploadPending().catch(() => {});
  const unsub = [store.subscribe('documentos', repaint), store.subscribe('groups', paintPills), onPendingChange(paintPending), onSyncChange(paintPending)];
  return {
    el,
    select: () => { if (store.list('documentos').length) setSelecting(true, { focus: true }); else toast('Aún no hay documentos que seleccionar'); },
    destroy: () => { unsub.forEach((u) => u()); document.removeEventListener('keydown', onKey); },
  };
}
