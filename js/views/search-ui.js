// Tabula · paleta de búsqueda global (Ctrl/⌘+K, «/», botón de la barra lateral)
// Patrón combobox + listbox accesible; los textos del usuario nunca pasan por innerHTML.

import { store } from '../store.js';
import { h, icon } from '../ui.js';
import { areaShort, getGroups } from '../school.js';
import { buildItems, createIndex, search, highlight, groupResults, TYPES } from '../search.js';

// ---------- Iconos propios de la paleta (mismo trazo que ui.js) ----------
const EXTRA = {
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  enter: '<path d="M20 5v6a2 2 0 0 1-2 2H5M9 9l-4 4 4 4"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
};
function ico(name, size = 18, cls = '') {
  if (!EXTRA[name]) return icon(name, size, cls);
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon ${cls}" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${EXTRA[name]}</svg>`;
  return t.content.firstChild;
}

const isApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
/** Texto del atajo para mostrar: «⌘K» en Apple, «Ctrl K» en el resto. */
export const searchHint = () => (isApple() ? '⌘K' : 'Ctrl K');

// ---------- Datos: índice perezoso, se invalida con cualquier cambio ----------
const COLS = ['groups', 'students', 'tasks', 'events', 'documentos', 'situaciones', 'sesiones', 'reuniones', 'medidas', 'programas', 'encuestas', 'gradebooks', 'observaciones', 'codigos'];
let dirty = true;
let cache = null; // { index, byKey }
function getIndex() {
  if (dirty || !cache) {
    const data = {};
    COLS.forEach((c) => { data[c] = store.list(c); });
    const items = buildItems(data, { areaShort });
    cache = { index: createIndex(items), byKey: new Map(items.map((i) => [i.key, i])) };
    dirty = false;
  }
  return cache;
}

// ---------- Búsquedas recientes (solo en este dispositivo) ----------
const RKEY = 'tabula:recentSearch';
const getRecent = () => { try { const v = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const pushRecent = (key) => { try { localStorage.setItem(RKEY, JSON.stringify([key, ...getRecent().filter((k) => k !== key)].slice(0, 8))); } catch {} };

// ---------- Navegación y acciones ----------
function goHash(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
/** Espera a que la vista nueva esté pintada: repite `fn` hasta que devuelva algo verdadero. */
function afterRoute(fn, tries = 75) {
  const tick = () => { let ok = false; try { ok = fn(); } catch {} if (!ok && tries-- > 0) setTimeout(tick, 40); };
  setTimeout(tick, 60);
}
const mainGroup = () => { const gs = getGroups(); return gs.find((g) => g.tutoria) || gs[0] || null; };

const ACTIONS = {
  'nueva-tarea': () => {
    goHash('#/tareas?vista=hoy');
    afterRoute(() => { const i = document.getElementById('tareas-quick'); if (i) { i.focus(); return true; } });
  },
  'nueva-reunion': () => {
    const g = mainGroup();
    if (!g) return goHash('#/grupos');
    goHash(`#/tutoria?${new URLSearchParams({ grupo: g.id, tab: 'reuniones' })}`);
    afterRoute(() => { const b = document.querySelector('.tu-panel .btn-primary'); if (b) { b.click(); return true; } });
  },
  'subir-documento': () => goHash('#/documentos'),
  'pasar-lista': () => {
    const g = mainGroup();
    goHash(g ? `#/grupos?${new URLSearchParams({ id: g.id, tab: 'asistencia' })}` : '#/grupos');
  },
  'barra-movil': () => import('./ajustes/menu.js').then((m) => m.openBarSheet()),
};

function run(go) {
  if (!go) return;
  if (go.hash) goHash(go.hash);
  else if (go.open === 'ficha') import('./grupos/sheets.js').then((m) => m.openFicha(go.id));
  else if (go.open === 'tarea') import('../tasks-model.js').then((m) => m.openTaskEditor(go.id));
  else if (go.ajuste) {
    goHash('#/ajustes');
    afterRoute(() => {
      const t = [...document.querySelectorAll('#view .card-title')].find((x) => x.textContent.trim() === go.ajuste);
      const card = t && t.closest('.card');
      if (!card) return false;
      card.scrollIntoView({ block: 'start', behavior: 'smooth' });
      card.classList.add('is-flash');
      setTimeout(() => card.classList.remove('is-flash'), 1800);
      return true;
    });
  } else if (go.action && ACTIONS[go.action]) ACTIONS[go.action]();
}

// ---------- Paleta ----------
let current = null; // { close }

export function openSearch({ from = null } = {}) {
  if (current) return;
  if (document.documentElement.classList.contains('is-locked')) return;
  const opener = from || document.activeElement;
  const { index, byKey } = getIndex();
  let options = [];   // [{ item, el }]
  let active = -1;
  let seq = 0;

  const input = h('input', {
    class: 'search-input', type: 'text', id: 'search-input', role: 'combobox', 'aria-expanded': 'true',
    'aria-controls': 'search-list', 'aria-autocomplete': 'list', 'aria-label': 'Buscar en Tabula',
    placeholder: 'Buscar alumnado, tareas, documentos…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search',
  });
  const clear = h('button', { type: 'button', class: 'search-clear', 'aria-label': 'Borrar búsqueda', hidden: true, tabindex: '-1',
    onclick: () => { input.value = ''; paint(); input.focus(); } }, icon('x', 16));
  const closeBtn = h('button', { type: 'button', class: 'search-close', 'aria-label': 'Cerrar búsqueda', onclick: () => close() },
    h('span', { class: 'k-desk' }, 'Esc'), h('span', { class: 'k-phone' }, 'Cancelar'));
  const list = h('div', { class: 'search-list', id: 'search-list', role: 'listbox', 'aria-label': 'Resultados' });
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const foot = h('div', { class: 'search-foot', 'aria-hidden': 'true' },
    h('span', {}, h('kbd', {}, ico('arrowUp', 12)), h('kbd', {}, ico('arrowDown', 12)), 'Moverse'),
    h('span', {}, h('kbd', {}, ico('enter', 12)), 'Abrir'),
    h('span', {}, h('kbd', {}, 'Esc'), 'Cerrar'));
  const panel = h('div', { class: 'search-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Buscar' },
    h('div', { class: 'search-field' }, ico('search', 20, 'search-lens'), input, clear, closeBtn),
    list, foot, live);
  const overlay = h('div', { class: 'search-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } }, panel);

  // ---- Pintado
  const markedNode = (text, query, cls) => {
    const el = h('span', { class: cls });
    for (const seg of highlight(text, query)) el.append(seg.mark ? h('mark', {}, seg.text) : document.createTextNode(seg.text));
    return el;
  };
  function optionEl(item, query, { showType = false } = {}) {
    const id = `so-${options.length}`;
    const meta = TYPES[item.type] || {};
    const sub = [showType ? meta.label : '', item.sub].filter(Boolean).join(' · ');
    const el = h('div', { class: `search-item${item.done ? ' is-done' : ''}`, role: 'option', id, 'aria-selected': 'false',
      onmousemove: () => { const i = options.findIndex((o) => o.el === el); if (i !== active) setActive(i); },
      onclick: () => choose(item) },
    h('span', { class: `search-ico t-${item.type}`, 'aria-hidden': 'true' }, ico(meta.icon || 'search', 18)),
    h('span', { class: 'search-text' },
      markedNode(item.title, query, 'search-title'),
      sub ? h('span', { class: 'search-sub' }, sub) : null),
    ico('enter', 15, 'search-go'));
    options.push({ item, el });
    return el;
  }
  const groupEl = (label, children) => {
    const gid = `sg-${seq++}`;
    return h('div', { class: 'search-group', role: 'group', 'aria-labelledby': gid },
      h('div', { class: 'search-group-label', id: gid }, label), ...children);
  };
  function hintLine() {
    const word = (w) => h('button', { type: 'button', class: 'search-tip', onclick: () => { input.value = w; paint(); input.focus(); } }, `«${w}»`);
    return h('p', { class: 'search-hint' }, 'Prueba: nombre de un alumno, ', word('ficha'), ', ', word('reunión'), '.');
  }

  function paint() {
    const query = input.value.trim();
    clear.hidden = !input.value;
    options = []; active = -1; seq = 0;
    const kids = [];
    if (!query) {
      const recents = getRecent().map((k) => byKey.get(k)).filter((i) => i && i.type !== 'accion').slice(0, 5);
      if (recents.length) kids.push(groupEl('Recientes', recents.map((i) => optionEl(i, '', { showType: true }))));
      const acts = ['nueva-tarea', 'nueva-reunion', 'subir-documento', 'pasar-lista'].map((a) => byKey.get(`accion:${a}`)).filter(Boolean);
      kids.push(groupEl('Acciones rápidas', acts.map((i) => optionEl(i, ''))));
      kids.push(hintLine());
      live.textContent = '';
    } else {
      const results = search(index, query, { recent: getRecent() });
      const groups = groupResults(results, 6);
      groups.forEach((g) => kids.push(groupEl((TYPES[g.type] || {}).label || g.type, g.results.map((r) => optionEl(r.item, query)))));
      if (!results.length) {
        kids.push(h('div', { class: 'search-empty' }, ico('search', 30), h('strong', {}, 'Sin resultados'),
          h('span', {}, 'Revisa la ortografía o prueba con menos palabras.'), hintLine()));
      }
      live.textContent = results.length ? `${options.length} resultados` : 'Sin resultados';
    }
    list.replaceChildren(...kids);
    list.scrollTop = 0;
    input.setAttribute('aria-expanded', String(options.length > 0));
    if (options.length) setActive(0, { scroll: false });
    else input.removeAttribute('aria-activedescendant');
  }

  function setActive(i, { scroll = true } = {}) {
    if (!options.length) return;
    active = (i + options.length) % options.length;
    options.forEach((o, n) => o.el.setAttribute('aria-selected', String(n === active)));
    const el = options[active].el;
    input.setAttribute('aria-activedescendant', el.id);
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  }

  function choose(item) {
    if (item.type !== 'accion') pushRecent(item.key);
    close({ restore: false });
    run(item.go);
  }

  // ---- Teclado
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Home' && !input.value) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && !input.value) { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) choose(options[active].item); }
  });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      // Foco atrapado entre el campo y el botón de cerrar
      const f = [input, ...(clear.hidden ? [] : [clear]), closeBtn];
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  };
  panel.addEventListener('keydown', onKey);

  // ---- Apertura y cierre
  const background = [document.querySelector('.app'), document.getElementById('bottom-nav')].filter(Boolean);
  background.forEach((el) => { el.inert = true; });
  document.documentElement.classList.add('search-open');
  document.body.append(overlay);
  paint();
  requestAnimationFrame(() => { overlay.classList.add('open'); });
  input.focus();

  function close({ restore = true } = {}) {
    if (!current) return;
    current = null;
    background.forEach((el) => { el.inert = false; });
    document.documentElement.classList.remove('search-open');
    overlay.remove();
    if (restore && opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
  }
  current = { close };
}

export const closeSearch = () => current && current.close();

/** Atajos globales: Ctrl/⌘+K (abre y cierra) y «/» fuera de un campo de texto. Invalida el índice al cambiar datos. */
export function initSearch() {
  store.subscribe('*', () => { dirty = true; });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (current) current.close(); else openSearch();
      return;
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !current) {
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing) return;
      e.preventDefault();
      openSearch();
    }
  });
}
