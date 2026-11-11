// Tabula · «En clase»: caja de herramientas para el aula (proyectable en la pizarra digital o en tableta)
import { store } from '../store.js';
import { h, icon, longDate } from '../ui.js';
import { pageHead } from '../ui-kit.js';
import { getGroups, getGroup } from '../school.js';
import { absentIds, defaultGroupId, svg } from './aula/common.js';

const TOOLS = [
  { id: 'temporizador', label: 'Temporizador', ico: () => icon('clock', 28), load: () => import('./aula/timer.js') },
  { id: 'azar', label: 'Al azar', ico: () => svg('dice', 28), load: () => import('./aula/azar.js') },
  { id: 'grupos', label: 'Grupos', ico: () => icon('grupos', 28), load: () => import('./aula/equipos.js') },
  { id: 'ruido', label: 'Semáforo', ico: () => svg('light', 28), load: () => import('./aula/semaforo.js') },
  { id: 'responsables', label: 'Responsables', ico: () => svg('star', 28), load: () => import('./aula/responsables.js') },
  { id: 'evaluar', label: 'Evaluar', ico: () => icon('check', 28), load: () => import('./aula/evaluar-tab.js') },
];

export function render(container, params) {
  const groups = getGroups();
  let groupId = params?.get('grupo') && getGroup(params.get('grupo')) ? params.get('grupo') : defaultGroupId();
  let tool = TOOLS.some((t) => t.id === params?.get('herramienta')) ? params.get('herramienta') : null;   // null = rejilla de herramientas
  let board = false; let gone = false;
  const mounted = new Map();   // id → { el, panel, api }
  const badges = {};

  // ---------- Cabecera ----------
  const groupSel = h('select', { class: 'select au-group-sel', id: 'au-grupo', 'aria-label': 'Grupo', onchange: (e) => setGroup(e.target.value) },
    groups.map((g) => h('option', { value: g.id, selected: g.id === groupId }, g.nombre)));
  // En modo pizarra, la salida queda siempre a la vista (la entrada está en «⋯»)
  const boardBtn = h('button', { type: 'button', class: 'btn btn-primary au-board-exit', onclick: () => toggleBoard() }, svg('shrink', 20), 'Salir de la pizarra');
  const tabs = h('div', { class: 'au-tabs', role: 'tablist', 'aria-label': 'Herramientas' });
  const stage = h('div', { class: 'au-stage' });
  const grid = h('div', { class: 'au-grid', role: 'list', 'aria-label': 'Herramientas' });
  const back = h('button', { type: 'button', class: 'btn au-back', onclick: () => show(null) }, icon('chevronLeft', 18), 'Herramientas');
  const toolName = h('span', { class: 'au-toolname' });
  const bar = h('div', { class: 'au-bar' }, back, toolName);
  const dictar = () => import('./voz.js').then((m) => m.openVoz({ groupId }));
  const root = h('div', { class: 'au-root' },
    pageHead({
      eyebrow: longDate(), title: 'En clase', className: 'au-head', aside: boardBtn,
      menu: () => [
        { icon: 'mic', label: 'Dictar', desc: 'Observaciones o tareas de este grupo', run: dictar },
        board ? { icon: 'slides', label: 'Salir de la pizarra', run: () => toggleBoard() }
          : { icon: 'slides', label: 'Modo pizarra', desc: 'Pantalla completa para proyectar', run: () => toggleBoard() },
      ],
    }),
    groups.length ? h('div', { class: 'ph-subnav au-group' }, h('label', { class: 'sr-only', for: 'au-grupo' }, 'Grupo'), groupSel) : '',
    bar, grid, tabs, stage);

  const ctx = {
    groupId: () => groupId,
    absent: () => absentIds(groupId),
    badge: (id) => (text) => { if ((badges[id] || '') === text) return; badges[id] = text; paintTabs(); },
  };

  function paintBoardBtn() {
    boardBtn.hidden = !board;
    if (!board && root.contains(document.activeElement) && document.activeElement === boardBtn) root.querySelector('.ph-menu')?.focus();
  }

  const tabEls = new Map();
  const gridEls = new Map();
  TOOLS.forEach((t) => {
    const badge = h('span', { class: 'au-tab-badge', hidden: true });
    const b = h('button', { type: 'button', role: 'tab', id: `au-tab-${t.id}`, 'aria-controls': `au-panel-${t.id}`, class: 'au-tab', onclick: () => show(t.id), onkeydown: tabKey }, t.label, badge);
    tabEls.set(t.id, { b, badge }); tabs.append(b);
    const gb = h('span', { class: 'au-tab-badge', hidden: true });
    const card = h('button', { type: 'button', role: 'listitem', class: 'au-tile', onclick: () => show(t.id) }, t.ico(), h('span', {}, t.label), gb);
    gridEls.set(t.id, gb); grid.append(card);
  });
  function paintTabs() {
    TOOLS.forEach((t) => {
      const { b, badge } = tabEls.get(t.id);
      b.setAttribute('aria-selected', String(t.id === tool)); b.tabIndex = t.id === tool || (!tool && t === TOOLS[0]) ? 0 : -1;
      const txt = badges[t.id] || ''; if (badge.textContent !== txt) badge.textContent = txt; badge.hidden = !txt;
      const gb = gridEls.get(t.id); if (gb) { gb.textContent = txt; gb.hidden = !txt; }
    });
    const inTool = !!tool;
    grid.hidden = inTool; bar.hidden = !inTool; tabs.hidden = !inTool; stage.hidden = !inTool;
    toolName.textContent = inTool ? TOOLS.find((t) => t.id === tool).label : '';
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
    const prev = tool && mounted.get(tool);
    if (prev && tool !== id) { prev.panel.hidden = true; prev.api.onHide && prev.api.onHide(); }
    tool = id; paintTabs();
    if (!id) {
      try { history.replaceState(null, '', `#/aula${groupId ? `?${new URLSearchParams({ grupo: groupId })}` : ''}`); } catch {}
      grid.querySelector('.au-tile')?.focus();
      return;
    }
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
    try { history.replaceState(null, '', `#/aula?${new URLSearchParams({ ...(tool ? { herramienta: tool } : {}), grupo: id })}`); } catch {}
    paintEmpty();
  }

  function paintEmpty() {
    stage.classList.toggle('is-empty', !groupId);
    grid.hidden = !groupId || !!tool;
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
  if (groupId && tool) show(tool);

  return () => {
    gone = true;
    document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('keydown', onKey);
    unsubs.forEach((u) => u());
    if (board) { document.documentElement.classList.remove('au-board-on'); try { document.fullscreenElement && document.exitFullscreen(); } catch {} }
    for (const m of mounted.values()) { try { m.api.destroy(); } catch {} }
    mounted.clear();
  };
}
