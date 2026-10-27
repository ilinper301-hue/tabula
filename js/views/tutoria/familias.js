// Tabula · Tutoría · pestaña «Familias» (cobertura de tutorías y listado del alumnado)
import { store } from '../../store.js';
import { h, icon } from '../../ui.js';
import { getGroup, getStudents } from '../../school.js';
import { familyCoverage } from '../../tutoria.js';
import { plural, listName, initials, shortDate, pill, segmented } from './common.js';
import { getReuniones } from './data.js';
import { openReunion } from './reunion-sheet.js';
import { openFichaTutoria } from './ficha.js';

export function mountFamilias(panel, { groupId }) {
  let filtro = 'todos';
  const cover = h('div', { class: 'card tu-cover' });
  const list = h('div', { class: 'card tu-list' });
  const seg = segmented('Mostrar', [['todos', 'Todo el grupo'], ['sin', 'Sin tutoría']], filtro, (v) => { filtro = v; paint(); });
  panel.replaceChildren(h('div', { class: 'tu-stack' }, cover, h('div', { class: 'tu-toolbar' }, seg.el), list));

  function paint() {
    const group = getGroup(groupId);
    const students = getStudents(groupId);
    const cov = familyCoverage(students, getReuniones(groupId));
    const stat = new Map(cov.con.map((x) => [x.student.id, x]));
    const n = students.length, k = cov.con.length;
    const pct = Math.round(cov.cobertura * 100);

    cover.replaceChildren(
      h('div', { class: 'tu-cover-top' },
        h('p', { class: 'tu-cover-text', id: 'tu-cover-text' },
          h('strong', {}, String(k)), ` de ${n} ${n === 1 ? 'familia atendida' : 'familias atendidas'} este curso`),
        h('span', { class: 'tu-cover-pct' }, `${pct} %`)),
      h('div', { class: 'tu-bar', role: 'progressbar', 'aria-labelledby': 'tu-cover-text', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(k) },
        h('i', { style: { width: `${pct}%` } })),
      h('p', { class: 'tu-hint' }, n === 0 ? 'Añade alumnado al grupo para llevar el seguimiento.'
        : cov.sin.length ? `${plural(cov.sin.length, 'familia', 'familias')} sin tutoría realizada todavía.` : 'Has atendido a todas las familias. Enhorabuena.'));

    seg.el.querySelector('[data-v="sin"]').textContent = `Sin tutoría · ${cov.sin.length}`;
    const shown = filtro === 'sin' ? students.filter((s) => !stat.has(s.id)) : students;
    if (!students.length) {
      list.replaceChildren(h('div', { class: 'empty' }, icon('grupos', 40), h('strong', {}, 'Este grupo aún no tiene alumnado'),
        h('a', { href: `#/grupos?id=${encodeURIComponent(groupId)}` }, 'Añadir alumnado en Grupos')));
      return;
    }
    if (!shown.length) { list.replaceChildren(h('p', { class: 'tu-empty' }, 'Todas las familias tienen alguna tutoría realizada.')); return; }
    list.replaceChildren(...shown.map((s) => {
      const st = stat.get(s.id);
      return h('div', { class: 'tu-row' },
        h('button', { type: 'button', class: 'tu-row-main', onclick: () => openFichaTutoria(s.id), 'aria-label': `Abrir ficha de tutoría de ${listName(s)}` },
          h('span', { class: `gr-avatar gr-c-${group && group.color || 't1'}`, 'aria-hidden': 'true' }, initials(s)),
          h('span', { class: 'tu-row-text' },
            h('span', { class: 'tu-row-title' }, listName(s)),
            h('span', { class: 'tu-row-sub' }, st ? `Última tutoría: ${shortDate(st.ultima)} · ${plural(st.n, 'tutoría', 'tutorías')}` : null,
              st ? null : pill('Sin tutoría', 't5')))),
        h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Citar a la familia de ${listName(s)}`,
          onclick: () => openReunion({ groupId, defaults: { tipo: 'familia', studentIds: [s.id] } }) }, 'Citar'));
    }));
  }
  paint();
  const unsubs = ['reuniones', 'students', 'groups'].map((c) => store.subscribe(c, paint));
  return () => unsubs.forEach((u) => u());
}
