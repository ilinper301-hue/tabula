// Tabula · Encuestas · editor (cabecera, pestañas, guardado automático y suscripciones)
import { h, icon } from '../../ui.js';
import { store } from '../../store.js';
import { onSyncChange } from '../../sync.js';
import { getResponses, publishSurvey, setSurveyOpen } from '../../surveys.js';
import { getPrograms } from '../../programs.js';
import { pickContent, sameContent, publicSig, defaultTab } from './model.js';
import { stateChip, programChip, plural, debounce } from './common.js';
import { createEditPanel } from './tab-editar.js';
import { createSharePanel } from './tab-compartir.js';
import { createResultsPanel } from './tab-resultados.js';

const TABS = [['editar', 'Editar'], ['compartir', 'Compartir'], ['resultados', 'Resultados']];
const PANELS = { editar: createEditPanel, compartir: createSharePanel, resultados: createResultsPanel };
const url = (id, tab) => `#/encuestas?id=${encodeURIComponent(id)}&tab=${tab}`;

export function renderEditor(container, id, wantedTab) {
  const first = store.get('encuestas', id);
  let draft = pickContent(first);
  let tab = TABS.some(([t]) => t === wantedTab) ? wantedTab : defaultTab(first);
  let panel = null;
  let unsaved = false;
  const stateEl = h('span', { class: 'enc-save', role: 'status', 'aria-live': 'polite' });
  const titleEl = h('h1', { class: 'page-title enc-title' });
  const metaEl = h('div', { class: 'enc-head-meta' });
  const panelHost = h('div', { class: 'enc-panel', role: 'tabpanel' });
  const tabBtns = {};

  // La publicación guarda una «firma» para saber si luego hay cambios sin publicar.
  if (first.publicId && !first.publicadaSig) store.update('encuestas', id, { publicadaSig: publicSig(first) });

  // ---------- Guardado ----------
  function flush() {
    save.cancel();
    if (!unsaved) return;
    unsaved = false;
    store.update('encuestas', id, JSON.parse(JSON.stringify(draft)));
    stateEl.textContent = 'Guardado';
  }
  const save = debounce(flush, 500);

  const ctx = {
    id,
    get draft() { return draft; },
    stored: () => store.get('encuestas', id),
    survey: () => ({ ...(store.get('encuestas', id) || {}), ...draft }),
    responses: () => getResponses(id),
    queueSave() { unsaved = true; stateEl.textContent = 'Guardando…'; save(); },
    flush,
    paintHead,
    go,
    /** Publica o actualiza lo publicado. Si estaba cerrada, la mantiene cerrada. */
    async publish() {
      flush();
      const wasClosed = ctx.stored()?.estado === 'cerrada';
      const link = await publishSurvey(id);
      if (wasClosed) await setSurveyOpen(id, false);
      store.update('encuestas', id, { publicadaSig: publicSig(ctx.survey()) });
      return link;
    },
  };

  // ---------- Cabecera ----------
  function paintHead() {
    const s = ctx.survey();
    titleEl.textContent = s.titulo?.trim() || 'Encuesta sin título';
    titleEl.classList.toggle('is-untitled', !s.titulo?.trim());
    const prog = s.programaId ? getPrograms({ includeArchived: true }).find((p) => p.id === s.programaId) : null;
    const n = ctx.responses().length;
    metaEl.replaceChildren(...[stateChip(s), programChip(prog), s.publicId ? h('span', { class: 'enc-hint' }, plural(n, 'respuesta', 'respuestas')) : null].filter(Boolean));
    const badge = tabBtns.resultados?.querySelector('.enc-badge');
    if (badge) { badge.textContent = String(n); badge.hidden = !s.publicId || !n; }
  }

  // ---------- Pestañas ----------
  function go(next, { replace = true } = {}) {
    flush();
    tab = next;
    if (replace) history.replaceState(null, '', url(id, tab)); // sin repintar toda la vista
    Object.entries(tabBtns).forEach(([t, b]) => { b.setAttribute('aria-selected', String(t === tab)); b.tabIndex = t === tab ? 0 : -1; });
    panel?.destroy();
    panel = PANELS[tab](ctx);
    panelHost.setAttribute('aria-labelledby', `enc-tab-${tab}`);
    panelHost.replaceChildren(panel.el);
    container.classList.toggle('enc-view-wide', tab === 'editar');
    paintHead();
  }

  const tabs = h('div', { class: 'segmented enc-tabs', role: 'tablist', 'aria-label': 'Secciones de la encuesta',
    onkeydown: (e) => {
      const i = TABS.findIndex(([t]) => t === tab);
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); const t = TABS[(i + d + TABS.length) % TABS.length][0]; go(t); tabBtns[t].focus(); }
    } },
    ...TABS.map(([t, label]) => (tabBtns[t] = h('button', { type: 'button', role: 'tab', id: `enc-tab-${t}`, 'aria-selected': 'false', onclick: () => go(t) },
      label, t === 'resultados' ? h('span', { class: 'enc-badge', hidden: true }) : null))));

  container.replaceChildren(
    h('header', { class: 'page-head enc-head' },
      h('div', { class: 'enc-head-main' },
        h('a', { class: 'link-btn enc-back', href: '#/encuestas' }, icon('chevronLeft', 16), 'Encuestas'),
        titleEl, metaEl),
      stateEl),
    tabs, panelHost);
  go(tab, { replace: false });

  // ---------- Suscripciones: cambios de otros dispositivos y respuestas nuevas ----------
  const poke = debounce((kind) => {
    if (!store.get('encuestas', id)) { location.hash = '#/encuestas'; return; } // borrada (aquí o en otro dispositivo)
    if (kind === 'survey' && !unsaved) {
      const stored = store.get('encuestas', id);
      if (!sameContent(stored, draft)) {
        // Cambio llegado de otro dispositivo: solo se aplica si no se está escribiendo.
        if (!(panel.hasFocus && panel.hasFocus())) { draft = pickContent(stored); panel.update('remote'); }
      }
    }
    paintHead();
    panel.update(kind);
  }, 60);
  const unsubs = [
    store.subscribe('encuestas', () => poke('survey')),
    store.subscribe('encuestaRespuestas', () => poke('responses')),
    store.subscribe('programas', () => poke('programs')),
    onSyncChange(() => poke('sync')),
  ];
  const onLeave = () => flush();
  addEventListener('pagehide', onLeave);
  document.addEventListener('visibilitychange', onLeave);

  return () => {
    flush();
    unsubs.forEach((u) => u());
    poke.cancel(); save.cancel();
    removeEventListener('pagehide', onLeave);
    document.removeEventListener('visibilitychange', onLeave);
    panel?.destroy();
    container.classList.remove('enc-view-wide');
  };
}
