// Tabula · vista «Tutoría»: familias, reuniones y atención a la diversidad del grupo de tutoría.
//
// Rutas:
//   #/tutoria[?grupo=<id>][&tab=familias|reuniones|diversidad][&reunion=<id>][&alumno=<id>]
//   ?reunion abre esa reunión; ?alumno abre la ficha de tutoría de ese alumno.
// Datos: colecciones 'reuniones' y 'medidas' (lógica pura en js/tutoria.js). Estilos: css/tutoria.css.
import { store } from '../store.js';
import { h, icon } from '../ui.js';
import { getGroups, getGroup } from '../school.js';
import { mountFamilias } from './tutoria/familias.js';
import { mountReuniones } from './tutoria/reuniones.js';
import { mountDiversidad } from './tutoria/diversidad.js';
import { openReunion } from './tutoria/reunion-sheet.js';
import { openFichaTutoria } from './tutoria/ficha.js';
import { closeSheets } from './tutoria/common.js';

const TABS = [['familias', 'Familias'], ['reuniones', 'Reuniones'], ['diversidad', 'Diversidad']];
const MOUNT = { familias: mountFamilias, reuniones: mountReuniones, diversidad: mountDiversidad };
const href = (p) => `#/tutoria?${new URLSearchParams(p)}`;

let lastGroup = null; // el grupo elegido se recuerda mientras se navega

export function render(container, params = new URLSearchParams()) {
  container.className = (container.className.replace(/\btutoria-view\b/g, '') + ' tutoria-view').trim();
  const cleanup = paint(container, params);
  return () => { cleanup && cleanup(); container.classList.remove('tutoria-view'); };
}

function pickGroup(groups, params) {
  // Un enlace a una reunión o a un alumno fija el grupo al que pertenece
  const rid = params.get('reunion'), sid = params.get('alumno');
  const r = rid && store.get('reuniones', rid);
  const st = sid && store.get('students', sid);
  const fromLink = (r && r.groupId) || (st && st.groupId);
  if (fromLink && getGroup(fromLink)) return getGroup(fromLink);
  const wanted = [params.get('grupo'), lastGroup].map((id) => (id ? getGroup(id) : null)).find((g) => g && !g.archivado);
  if (wanted) return wanted;
  return groups.find((g) => g.tutoria) || groups[0] || null;
}

function paint(container, params) {
  const groups = getGroups();
  const group = pickGroup(groups, params);
  const head = (right) => h('header', { class: 'page-head' },
    h('div', {}, h('div', { class: 'eyebrow' }, 'Familias y atención a la diversidad'), h('h1', { class: 'page-title' }, 'Tutoría')), right);

  if (!group) {
    container.replaceChildren(head(), h('div', { class: 'card' }, h('div', { class: 'empty' }, icon('tutoria', 44),
      h('strong', {}, 'Primero crea tu grupo'),
      'La tutoría se organiza por grupo: reuniones con familias, acuerdos y medidas de atención a la diversidad.',
      h('div', { class: 'tu-empty-actions' }, h('a', { class: 'btn btn-primary', href: '#/grupos' }, icon('plus', 16), 'Ir a Grupos')))));
    return null;
  }
  lastGroup = group.id;

  const rid = params.get('reunion'), sid = params.get('alumno');
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : (rid ? 'reuniones' : 'familias');

  const select = h('select', { class: 'select tu-group-select', id: 'tu-group', 'aria-label': 'Grupo',
    onchange: (e) => { location.hash = href({ grupo: e.target.value, tab }); } },
  (groups.some((g) => g.id === group.id) ? groups : [...groups, group]).map((g) => h('option', { value: g.id, selected: g.id === group.id }, g.nombre + (g.tutoria ? ' · tutoría' : ''))));
  const tabs = h('div', { class: 'segmented tu-tabs', role: 'tablist', 'aria-label': 'Secciones de tutoría' },
    TABS.map(([k, label]) => h('a', { role: 'tab', class: 'tu-tab', href: href({ grupo: group.id, tab: k }), 'aria-selected': String(k === tab) }, label)));
  const panel = h('div', { class: 'tu-panel', role: 'tabpanel' });

  container.replaceChildren(head(groups.length > 1 ? select : null), tabs, panel);
  const stop = MOUNT[tab](panel, { groupId: group.id });
  // Enlaces profundos: se abre una sola vez, al entrar
  if (rid && store.get('reuniones', rid)) openReunion({ groupId: group.id, reunionId: rid });
  else if (sid && store.get('students', sid)) openFichaTutoria(sid);
  const unsub = store.subscribe('groups', () => { if (!getGroup(group.id)) location.hash = '#/tutoria'; });
  return () => { stop && stop(); unsub(); closeSheets(); };
}
