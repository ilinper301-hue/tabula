// Tabula · Cuaderno · Informes del grupo
// Ruta: #/cuaderno?grupo=<id>&vista=informes&tab=perfil|seneca|familias&ev=1|2|3|final
// Usa todos los cuadernos del grupo en el curso escolar.
import { store } from '../../store.js';
import { h, icon } from '../../ui.js';
import { getGroups, getGroup, currentSchoolYear } from '../../school.js';
import { EVALUACIONES } from '../../grading.js';
import { currentEv } from './model.js';
import { segmented } from './common.js';
import { loadGroupData } from './informes-data.js';
import { mountPerfil } from './informes-perfil.js';
import { mountSeneca } from './informes-seneca.js';
import { mountFamilias } from './informes-familias.js';
import { mountJunta } from './informes-junta.js';

const TABS = [['perfil', 'Perfil competencial'], ['seneca', 'Séneca'], ['familias', 'Familias'], ['junta', 'Junta']];
const last = { groupId: null, ev: null, tab: null };

export function renderInformes(container, params = new URLSearchParams()) {
  container.className = (container.className.replace(/\bcb-informes-view\b/g, '') + ' cb-informes-view').trim();
  const groups = getGroups();
  const g = groups.find((x) => x.id === (params.get('grupo') || last.groupId)) || groups.find((x) => x.tutoria) || groups[0] || null;
  const evParam = params.get('ev') || last.ev;
  const tabParam = params.get('tab') || last.tab;
  const st = {
    groupId: g ? g.id : null,
    ev: EVALUACIONES.some((e) => e.id === evParam) ? evParam : currentEv(),
    tab: TABS.some(([k]) => k === tabParam) ? tabParam : 'perfil',
  };
  let body = null;
  let token = 0;
  let alive = true;

  const hashFor = (extra = {}) => {
    const p = new URLSearchParams({ grupo: st.groupId || '', vista: 'informes', tab: st.tab, ev: st.ev, ...extra });
    return `#/cuaderno?${p}`;
  };
  const sync = () => { Object.assign(last, st); try { history.replaceState(null, '', hashFor()); } catch { /* sin historial */ } };
  const backHref = () => `#/cuaderno?${new URLSearchParams({ grupo: st.groupId || '', ev: st.ev })}`;

  function header() {
    const group = getGroup(st.groupId);
    return h('header', { class: 'page-head cb-head cb-noprint' },
      h('div', {},
        h('a', { class: 'cb-inf-back', href: backHref() }, icon('chevronLeft', 16), 'Volver al cuaderno'),
        h('h1', { class: 'page-title' }, 'Informes'),
        h('div', { class: 'eyebrow' }, group ? `${group.nombre} · curso ${group.cursoEscolar || currentSchoolYear()}` : '')));
  }

  function toolbar() {
    const groupSel = h('select', { class: 'select cb-group', 'aria-label': 'Grupo', onchange: (e) => { st.groupId = e.target.value; sync(); paintAll(); } },
      groups.map((x) => h('option', { value: x.id, selected: x.id === st.groupId }, x.nombre)));
    const evSeg = segmented(EVALUACIONES.map((e) => [e.id, e.id === 'final' ? 'Final' : e.label.replace(' evaluación', '')]),
      st.ev, (v) => { st.ev = v; sync(); paintBody(); }, 'Evaluación');
    evSeg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-label', EVALUACIONES[i].label));
    const tabs = segmented(TABS, st.tab, (v) => { st.tab = v; sync(); paintBody(); }, 'Sección de informes');
    tabs.classList.add('cb-inf-tabs');
    tabs.querySelector('button').replaceChildren('Perfil', h('span', { class: 'cb-inf-long' }, ' competencial'));
    return h('div', { class: 'cb-inf-bar cb-noprint' }, h('div', { class: 'cb-inf-bar-l' }, groupSel, evSeg), tabs);
  }

  async function paintBody() {
    const my = ++token;
    if (!body) return;
    // Los botones de evaluación/pestaña se actualizan con su propio estado; solo se rehace el contenido.
    let data;
    try { data = await loadGroupData(st.groupId, st.ev); } catch (e) { console.error(e); return; }
    if (my !== token || !alive) return;
    data.evLabel = EVALUACIONES.find((e) => e.id === st.ev)?.label || '';
    const ctrl = { onRepaint: () => paintBodyKeepScroll() };
    const content = h('div', { class: 'cb-inf-body' });
    if (st.tab === 'perfil') mountPerfil(content, data, ctrl);
    else if (st.tab === 'seneca') mountSeneca(content, data);
    else if (st.tab === 'junta') mountJunta(content, data);
    else mountFamilias(content, data, ctrl);
    body.replaceChildren(content);
  }
  function paintBodyKeepScroll() {
    const y = window.scrollY;
    paintBody().then(() => window.scrollTo(0, y));
  }

  function paintAll() {
    const g2 = getGroup(st.groupId);
    if (!g2) {
      container.replaceChildren(h('header', { class: 'page-head' }, h('div', {}, h('h1', { class: 'page-title' }, 'Informes'))),
        h('div', { class: 'card' }, h('div', { class: 'empty cb-empty' }, icon('grupos', 44), h('strong', {}, 'Primero crea un grupo'),
          'Los informes necesitan un grupo con su alumnado.', h('div', { class: 'cb-empty-actions' }, h('a', { class: 'btn btn-primary', href: '#/grupos' }, 'Ir a Grupos')))));
      return;
    }
    body = h('div', { class: 'cb-inf-main', 'aria-live': 'polite' });
    container.replaceChildren(header(), toolbar(), body);
    paintBody();
  }

  sync();
  paintAll();

  // Cambios en los datos: se recalcula (aplazado para agrupar varios cambios seguidos)
  let timer = null;
  const refresh = () => {
    clearTimeout(timer); timer = setTimeout(() => { if (alive && body) paintBodyKeepScroll(); }, 120);
  };
  const unsubs = ['gradebooks', 'activities', 'grades', 'students', 'informes', 'attendance']
    .map((c) => store.subscribe(c, refresh));

  return () => {
    alive = false; clearTimeout(timer);
    unsubs.forEach((u) => u());
    container.classList.remove('cb-informes-view');
  };
}
