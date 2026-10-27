// Tabula · «En clase»: caja de herramientas para el aula (proyectable en la pizarra digital o en tableta)
import { store } from '../store.js';
import { h, icon, longDate } from '../ui.js';
import { getGroups, getGroup } from '../school.js';
import { absentIds, defaultGroupId, svg } from './aula/common.js';

const TOOLS = [
  { id: 'temporizador', label: 'Temporizador', load: () => import('./aula/timer.js') },
  { id: 'azar', label: 'Al azar', load: () => import('./aula/azar.js') },
  { id: 'grupos', label: 'Grupos', load: () => import('./aula/equipos.js') },
  { id: 'ruido', label: 'Semáforo', load: () => import('./aula/semaforo.js') },
  { id: 'responsables', label: 'Responsables', load: () => import('./aula/responsables.js') },
  { id: 'evaluar', label: 'Evaluar', load: () => import('./aula/evaluar-tab.js') },
];

let lastTool = 'temporizador';

export function render(container, params) {
  const groups = getGroups();
  let groupId = params?.get('grupo') && getGroup(params.get('grupo')) ? params.get('grupo') : defaultGroupId();
  let tool = TOOLS.some((t) => t.id === params?.get('herramienta')) ? params.get('herramienta') : lastTool;
  let board = false; let gone = false;
  const mounted = new Map();   // id → { el, panel, api }
  const badges = {};

  // ---------- Cabecera ----------
  const groupSel = h('select', { class: 'select au-group-sel', id: 'au-grupo', 'aria-label': 'Grupo', onchange: (e) => setGroup(e.target.value) },
    groups.map((g) => h('option', { value: g.id, selected: g.id === groupId }, g.nombre)));
  const boardBtn = h('button', { type: 'button', class: 'btn au-board-btn', 'aria-pressed': 'false', onclick: () => toggleBoard() });
  const tabs = h('div', { class: 'au-tabs', role: 'tablist', 'aria-label': 'Herramientas' });
  const stage = h('div', { class: 'au-stage' });
  const root = h('div', { class: 'au-root' },
    h('header', { class: 'page-head au-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, longDate()), h('h1', { class: 'page-title' }, 'En clase')),
      h('div', { class: 'au-head-tools' }, groups.length ? h('div', { class: 'au-group' }, h('label', { class: 'sr-only', for: 'au-grupo' }, 'Grupo'), groupSel) : null, boardBtn)),
    tabs, stage);

  const ctx = {
    groupId: () => groupId,
    absent: () => absentIds(groupId),
    badge: (id) => (text) => { if ((badges[id] || '') === text) return; badges[id] = text; paintTabs(); },
  };

  function paintBoardBtn() {
    boardBtn.replaceChildren(svg(board ? 'shrink' : 'board', 20), h('span', { class: 'au-board-lbl' }, board ? 'Salir de la pizarra' : 'Modo pizarra'));
    boardBtn.setAttribute('aria-pressed', String(board));
  }

  const tabEls = new Map();
  TOOLS.forEach((t) => {
    const badge = h('span', { class: 'au-tab-badge', hidden: true });
    const b = h('button', { type: 'button', role: 'tab', id: `au-tab-${t.id}`, 'aria-controls': `au-panel-${t.id}`, class: 'au-tab', onclick: () => show(t.id), onkeydown: tabKey }, t.label, badge);
    tabEls.set(t.id, { b, badge }); tabs.append(b);
  });
  function paintTabs() {
    TOOLS.forEach((t) => {
      const { b, badge } = tabEls.get(t.id);
      b.setAttribute('aria-selected', String(t.id === tool)); b.tabIndex = t.id === tool ? 0 : -1;
      const txt = badges[t.id] || ''; if (badge.textContent !== txt) badge.textContent = txt; badge.hidden = !txt;
    });
  }
  function tabKey(e) {
    const i = TOOLS.findIndex((t) => t.id === tool);
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    show(TOOLS[(i + d + TOOLS.length) % TOOLS.length].id);
    tabs.querySelector('[aria-selected="true"]')?.focus();
  }

  async function show(id) {
    const prev = mounted.get(tool);
    if (prev && tool !== id) { prev.panel.hidden = true; prev.api.onHide && prev.api.onHide(); }
    tool = id; lastTool = id; paintTabs();
    try { tabEls.get(id).b.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch {}
    try { history.replaceState(null, '', `#/aula?${new URLSearchParams({ herramienta: id, ...(groupId ? { grupo: groupId } : {}) })}`); } catch {}
    let m = mounted.get(id);
    if (!m) {
      const def = TOOLS.find((t) => t.id === id);
      const mod = await def.load();
      if (gone) return;
      if (tool !== id) return;
      const api = mod.create({ ...ctx, badge: ctx.badge(id) });
      const panel = h('section', { class: 'au-panel', role: 'tabpanel', id: `au-panel-${id}`, 'aria-labelledby': `au-tab-${id}` }, api.el);
      stage.append(panel); m = { api, panel }; mounted.set(id, m);
    }
    m.panel.hidden = false; m.api.onShow && m.api.onShow();
  }

  function setGroup(id) {
    groupId = id; groupSel.value = id;
    for (const m of mounted.values()) m.api.setGroup && m.api.setGroup(id);
    try { history.replaceState(null, '', `#/aula?${new URLSearchParams({ herramienta: tool, grupo: id })}`); } catch {}
    paintEmpty();
  }

  function paintEmpty() {
    stage.classList.toggle('is-empty', !groupId);
    root.querySelector('.au-nogroup')?.remove();
    if (!groupId) {
      stage.before(h('div', { class: 'card au-nogroup' }, h('div', { class: 'empty' }, icon('grupos', 36), h('strong', {}, 'Aún no tienes ningún grupo'),
        'Crea tu grupo y añade al alumnado para usar las herramientas.', h('div', {}, h('a', { class: 'btn', href: '#/grupos', style: { marginTop: '10px' } }, 'Ir a Grupos')))));
    }
  }

  // ---------- Modo pizarra ----------
  function setBoard(on) {
    board = on; root.classList.toggle('au-board', on); document.documentElement.classList.toggle('au-board-on', on); paintBoardBtn();
  }
  async function toggleBoard() {
    if (board) { setBoard(false); try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {} return; }
    setBoard(true);
    try { await document.documentElement.requestFullscreen?.(); } catch {}   // si no se puede, queda a pantalla completa de la app
  }
  let fsActive = false;
  const onFs = () => {
    if (document.fullscreenElement) fsActive = true;
    else { if (fsActive && board) setBoard(false); fsActive = false; }
  };
  const onKey = (e) => { if (e.key === 'Escape' && board && !document.querySelector('.overlay')) { setBoard(false); try { document.fullscreenElement && document.exitFullscreen(); } catch {} } };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('keydown', onKey);

  // Cambios en los datos (asistencia, alumnado…) repintan las herramientas montadas
  const unsubs = ['attendance', 'students', 'groups'].map((c) => store.subscribe(c, () => { for (const m of mounted.values()) m.api.refresh && m.api.refresh(); }));

  container.replaceChildren(root);
  paintBoardBtn(); paintTabs(); paintEmpty();
  if (groupId) show(tool);

  return () => {
    gone = true;
    document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('keydown', onKey);
    unsubs.forEach((u) => u());
    if (board) { document.documentElement.classList.remove('au-board-on'); try { document.fullscreenElement && document.exitFullscreen(); } catch {} }
    for (const m of mounted.values()) { try { m.api.destroy(); } catch {} }
    mounted.clear();
  };
}
