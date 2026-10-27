// Tabula · vista «Grupos» (grupos, alumnado, asistencia y resumen)
//
// Rutas:
//   #/grupos                                     lista de grupos
//   #/grupos?id=<id>[&tab=alumnado|asistencia|resumen|observaciones[&ev=curso|1|2|3]]
//   #/grupos?id=<id>&tab=asistencia&fecha=YYYY-MM-DD   pasar lista de esa fecha (por defecto hoy)
import { store } from '../store.js';
import { h, icon, todayISO } from '../ui.js';
import { getGroups, getGroup, getStudents, getAttendance } from '../school.js';
import { colorOf, plural, go } from './grupos/common.js';
import { openGroupSheet } from './grupos/sheets.js';
import { mountAlumnado } from './grupos/alumnado.js';
import { mountAsistencia } from './grupos/asistencia.js';
import { mountResumen } from './grupos/resumen.js';
import { mountObservaciones } from './anecdotario/group-tab.js';

const TABS = [['alumnado', 'Alumnado'], ['asistencia', 'Asistencia'], ['resumen', 'Resumen'], ['observaciones', 'Observaciones']];
const href = (p) => `#/grupos?${new URLSearchParams(p)}`;

// La sección de archivados recuerda si está abierta mientras se navega.
let archivedOpen = false;

export function render(container, params = new URLSearchParams()) {
  const id = params.get('id');
  const group = id ? getGroup(id) : null;
  container.className = (container.className.replace(/\bgrupos-view\b/g, '') + ' grupos-view').trim();
  const cleanup = group ? renderDetail(container, group, params) : renderList(container);
  return () => { cleanup && cleanup(); container.classList.remove('grupos-view'); };
}

// ============================================================
// Lista de grupos
// ============================================================
function renderList(container) {
  const body = h('div', { class: 'gr-list-body' });
  const newBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openNew() }, icon('plus', 16), 'Nuevo grupo');
  const openNew = () => openGroupSheet(null, { onSaved: (g) => go({ id: g.id }) });

  container.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Tu alumnado'), h('h1', { class: 'page-title' }, 'Grupos')),
      newBtn),
    body);

  function card(g) {
    const n = getStudents(g.id).length;
    const done = !!getAttendance(g.id, todayISO());
    const c = colorOf(g);
    return h('article', { class: `card gr-card gr-c-${c}${g.archivado ? ' is-archived' : ''}` },
      h('a', { class: 'gr-card-main', href: href({ id: g.id }) },
        h('span', { class: 'gr-card-badge', 'aria-hidden': 'true' }, g.nombre.slice(0, 3)),
        h('span', { class: 'gr-card-text' },
          h('span', { class: 'card-title' }, g.nombre),
          h('span', { class: 'gr-muted' }, `${g.curso}º de Primaria · ${g.cursoEscolar}`),
          h('span', { class: 'gr-card-chips' }, plural(n, 'alumno', 'alumnos'),
            g.tutoria ? h('span', { class: `chip ${c}` }, 'Tutoría') : null))),
      g.archivado
        ? h('div', { class: 'gr-card-foot' },
          h('button', { type: 'button', class: 'btn', onclick: () => {
            store.update('groups', g.id, { archivado: false });
          } }, 'Restaurar'))
        : h('div', { class: 'gr-card-foot' },
          n === 0
            ? h('span', { class: 'gr-att-state' }, icon('grupos', 16), 'Sin alumnado')
            : h('span', { class: `gr-att-state${done ? ' ok' : ''}` }, icon(done ? 'check' : 'clock', 16), done ? 'Lista pasada' : 'Sin pasar lista'),
          h('a', { class: 'btn', href: href({ id: g.id, tab: 'asistencia' }) }, 'Pasar lista')));
  }

  function paint() {
    const all = getGroups({ includeArchived: true });
    const active = all.filter((g) => !g.archivado);
    const archived = all.filter((g) => g.archivado);
    const parts = [];
    if (!active.length) {
      parts.push(h('div', { class: 'card' }, h('div', { class: 'empty gr-empty-big' }, icon('grupos', 44),
        h('strong', {}, archived.length ? 'No tienes grupos activos' : 'Crea tu primer grupo'),
        archived.length ? 'Crea uno nuevo o restaura alguno archivado.' : 'Añade tu clase (por ejemplo «1º A») y después pega la lista de tu alumnado para empezar a pasar lista.',
        h('div', { class: 'gr-empty-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: openNew }, icon('plus', 16), 'Nuevo grupo')))));
    } else {
      parts.push(h('div', { class: 'gr-cards' }, active.map(card)));
    }
    if (archived.length) {
      parts.push(h('section', { class: 'gr-archived' },
        h('button', {
          type: 'button', class: 'gr-archived-toggle', 'aria-expanded': String(archivedOpen),
          onclick: () => { archivedOpen = !archivedOpen; paint(); },
        }, icon(archivedOpen ? 'chevronDown' : 'chevronRight', 16), `Cursos anteriores (${archived.length})`),
        archivedOpen ? h('div', { class: 'gr-cards' }, archived.map(card)) : null));
    }
    body.replaceChildren(...parts);
  }

  paint();
  const unsubs = ['groups', 'students', 'attendance'].map((c) => store.subscribe(c, paint));
  return () => unsubs.forEach((u) => u());
}

// ============================================================
// Detalle de un grupo
// ============================================================
function renderDetail(container, group, params) {
  const groupId = group.id;
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'alumnado';

  const head = h('header', { class: 'page-head gr-head' });
  const tabs = h('div', { class: 'segmented gr-tabs', role: 'tablist', 'aria-label': 'Secciones del grupo' },
    TABS.map(([k, label]) => h('a', {
      role: 'tab', href: href({ id: groupId, tab: k }), 'aria-selected': String(k === tab), class: 'gr-tab',
    }, label)));
  const panel = h('div', { class: 'gr-panel', role: 'tabpanel' });

  function paintHead() {
    const g = getGroup(groupId);
    if (!g) { go(); return; } // el grupo ya no existe
    const c = colorOf(g);
    head.replaceChildren(
      h('div', {},
        h('a', { class: 'link-btn gr-back', href: '#/grupos' }, icon('chevronLeft', 14), 'Grupos'),
        h('h1', { class: 'page-title' }, g.nombre),
        h('div', { class: 'gr-head-meta' }, h('span', { class: 'eyebrow' }, `${g.curso}º de Primaria · curso ${g.cursoEscolar}`),
          g.tutoria ? h('span', { class: `chip ${c}` }, 'Tutoría') : null,
          g.archivado ? h('span', { class: 'chip t5' }, 'Archivado') : null)),
      h('button', { type: 'button', class: 'btn', onclick: () => openGroupSheet(g) }, 'Editar grupo'));
  }
  paintHead();
  container.replaceChildren(head, tabs, panel);

  const mount = { alumnado: mountAlumnado, asistencia: mountAsistencia, resumen: mountResumen, observaciones: mountObservaciones }[tab];
  const cleanupTab = mount(panel, groupId, params.get('fecha'), params);
  const unsub = store.subscribe('groups', paintHead);
  return () => { unsub(); cleanupTab && cleanupTab(); };
}
