// Tabula · vista «Planes y programas»
//
// Rutas:
//   #/programas                                   lista de programas
//   #/programas?id=<id>[&tab=diario|objetivos|tareas|equipo|memoria]
import { store } from '../store.js';
import { h, icon, relativeDay } from '../ui.js';
import { PROGRAM_TYPES, ROLES, getPrograms, programStats, fmtDuration } from '../programs.js';
import { currentSchoolYear } from '../school.js';
import { colorOf, go, hrefTo, plural } from './programas/common.js';
import { openProgramSheet, SUGGESTIONS } from './programas/sheet.js';
import { openQuickEntry } from './programas/quick.js';
import { mountDiario } from './programas/diario.js';
import { mountObjetivos } from './programas/objetivos.js';
import { mountTareas } from './programas/tareas.js';
import { mountEquipo } from './programas/equipo.js';
import { mountMemoria } from './programas/memoria.js';

export { openQuickEntry };

const TABS = [['diario', 'Diario'], ['objetivos', 'Objetivos'], ['tareas', 'Tareas'], ['equipo', 'Equipo'], ['memoria', 'Memoria']];
let archivedOpen = false; // la sección de archivados recuerda si está abierta

export function render(container, params = new URLSearchParams()) {
  const id = params.get('id');
  const program = id ? store.get('programas', id) : null;
  container.classList.add('pg-view');
  const cleanup = program ? renderDetail(container, program, params) : renderList(container);
  return () => { cleanup && cleanup(); container.classList.remove('pg-view'); };
}

// ============================================================
// Lista
// ============================================================
function renderList(container) {
  const body = h('div', { class: 'pg-list-body' });
  const openNew = (prefill) => openProgramSheet(null, { prefill, onSaved: (p) => go({ id: p.id }) });
  container.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, `Curso ${currentSchoolYear()}`), h('h1', { class: 'page-title' }, 'Planes y programas')),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openNew() }, icon('plus', 16), 'Nuevo programa')),
    body);

  function card(p) {
    const st = programStats(p.id);
    const c = colorOf(p);
    const stat = (value, label) => h('div', { class: 'pg-card-stat' }, h('strong', {}, value), h('span', {}, label));
    return h('article', { class: `card pg-card pg-c-${c}${p.archivado ? ' is-archived' : ''}` },
      h('a', { class: 'pg-card-main', href: hrefTo({ id: p.id }) },
        h('span', { class: 'card-title' }, p.nombre),
        h('span', { class: 'pg-card-chips' },
          h('span', { class: `chip ${c}` }, PROGRAM_TYPES[p.tipo] || 'Programa'),
          h('span', { class: 'chip pg-chip-neutral' }, ROLES[p.rol] || ''),
          p.cursoEscolar !== currentSchoolYear() ? h('span', { class: 'pg-muted' }, p.cursoEscolar) : null),
        h('span', { class: 'pg-card-stats' },
          stat(String(st.entradas), st.entradas === 1 ? 'entrada' : 'entradas'),
          stat(st.minutos ? fmtDuration(st.minutos) : '0 h', 'dedicado'),
          stat(`${st.objetivos.hechos}/${st.objetivos.total}`, 'objetivos'))),
      h('div', { class: 'pg-card-foot' },
        h('span', { class: 'pg-muted' }, st.ultima ? `Última: ${relativeDay(st.ultima)}` : 'Sin anotaciones'),
        p.archivado
          ? h('button', { type: 'button', class: 'btn', onclick: () => store.update('programas', p.id, { archivado: false }) }, 'Restaurar')
          : h('button', { type: 'button', class: 'btn', 'aria-label': `Anotar en el diario de ${p.nombre}`, onclick: () => openQuickEntry({ programaId: p.id }) }, icon('plus', 16), 'Anotar')));
  }

  function paint() {
    const all = getPrograms({ includeArchived: true });
    const active = all.filter((p) => !p.archivado);
    const archived = all.filter((p) => p.archivado);
    const parts = [];
    if (!active.length) {
      parts.push(h('div', { class: 'card' }, h('div', { class: 'empty pg-empty-big' }, icon('flag', 44),
        h('strong', {}, archived.length ? 'No tienes programas activos' : 'Aún no tienes planes ni programas'),
        'Crea el que coordinas o en el que participas y anota cada día lo que haces: al final del curso la memoria saldrá sola.',
        h('div', { class: 'pg-suggest', role: 'group', 'aria-label': 'Sugerencias' },
          SUGGESTIONS.map((s) => h('button', { type: 'button', class: 'btn', onclick: () => openNew(s) }, icon('plus', 15), s.nombre))),
        h('div', { style: { marginTop: '10px' } }, h('button', { type: 'button', class: 'link-btn', onclick: () => openNew() }, 'Crear otro distinto')))));
    } else {
      parts.push(h('div', { class: 'pg-cards' }, active.map(card)));
    }
    if (archived.length) {
      parts.push(h('section', { class: 'pg-archived' },
        h('button', {
          type: 'button', class: 'pg-archived-toggle', 'aria-expanded': String(archivedOpen),
          onclick: () => { archivedOpen = !archivedOpen; paint(); },
        }, icon(archivedOpen ? 'chevronDown' : 'chevronRight', 16), `Archivados (${archived.length})`),
        archivedOpen ? h('div', { class: 'pg-cards' }, archived.map(card)) : null));
    }
    body.replaceChildren(...parts);
  }
  paint();
  const unsubs = ['programas', 'diarioPrograma'].map((c) => store.subscribe(c, paint));
  return () => unsubs.forEach((u) => u());
}

// ============================================================
// Detalle
// ============================================================
function renderDetail(container, program, params) {
  const programaId = program.id;
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'diario';
  const head = h('header', { class: 'page-head pg-head' });
  const tabs = h('div', { class: 'segmented pg-tabs', role: 'tablist', 'aria-label': 'Secciones del programa' },
    TABS.map(([k, label]) => h('a', { role: 'tab', class: 'pg-tab', href: hrefTo({ id: programaId, tab: k }), 'aria-selected': String(k === tab) }, label)));
  const panel = h('div', { class: 'pg-panel', role: 'tabpanel' });

  function paintHead() {
    const p = store.get('programas', programaId);
    if (!p) { go(); return; } // eliminado (p. ej. desde otro dispositivo)
    const c = colorOf(p);
    head.replaceChildren(
      h('div', {},
        h('a', { class: 'link-btn pg-back', href: '#/programas' }, icon('chevronLeft', 14), 'Planes y programas'),
        h('h1', { class: 'page-title' }, p.nombre),
        h('div', { class: 'pg-head-meta' },
          h('span', { class: `chip ${c}` }, PROGRAM_TYPES[p.tipo] || 'Programa'),
          h('span', { class: 'chip pg-chip-neutral' }, ROLES[p.rol] || ''),
          h('span', { class: 'eyebrow' }, `Curso ${p.cursoEscolar} · #${p.etiqueta}`),
          p.archivado ? h('span', { class: 'chip t5' }, 'Archivado') : null),
        p.descripcion ? h('p', { class: 'pg-desc' }, p.descripcion) : null),
      h('button', { type: 'button', class: 'btn', onclick: () => openProgramSheet(p, { onDeleted: () => go() }) }, 'Editar programa'));
  }
  paintHead();
  container.replaceChildren(head, tabs, panel);

  const mount = { diario: mountDiario, objetivos: mountObjetivos, tareas: mountTareas, equipo: mountEquipo, memoria: mountMemoria }[tab];
  const cleanupTab = mount(panel, programaId);
  const unsub = store.subscribe('programas', paintHead);
  return () => { unsub(); cleanupTab && cleanupTab(); };
}
