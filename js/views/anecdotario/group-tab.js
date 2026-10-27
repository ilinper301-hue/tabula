// Tabula · Anecdotario · pestaña «Observaciones» del grupo: recuento por alumno y periodo.
import { store } from '../../store.js';
import { h, icon } from '../../ui.js';
import { getGroup, getStudents, listName, initials } from '../../school.js';
import { listObservations, tally, tallyByStudent } from '../../observations.js';
import { plural, rangeFor, tallyEl, tallyText } from './common.js';
import { openQuickObservation } from './quick.js';
import { openStudentObservations } from './list.js';

const PERIODS = [['curso', 'Todo el curso'], ['1', '1.ª eval.'], ['2', '2.ª eval.'], ['3', '3.ª eval.']];
const COLS = [['positiva', '+', 'Positivas'], ['negativa', '−', 'A mejorar'], ['neutra', '·', 'Notas']];

/** Pinta la pestaña en `panel`. Devuelve la función de limpieza. */
export function mountObservaciones(panel, groupId, _fecha, params) {
  const wantedEv = params && params.get('ev');
  let ev = PERIODS.some(([k]) => k === wantedEv) ? wantedEv : 'curso';
  let sort = { key: 'nombre', dir: 1 };

  const periodSeg = h('div', { class: 'segmented ao-periods', role: 'group', 'aria-label': 'Periodo' },
    PERIODS.map(([k, label]) => h('button', {
      type: 'button', 'aria-pressed': String(k === ev), 'aria-selected': String(k === ev), dataset: { k },
      onclick: () => { ev = k; paint(); },
    }, label)));
  const observe = h('button', { type: 'button', class: 'btn btn-primary ao-observe', onclick: () => openQuickObservation({ groupId }) },
    icon('plus', 16), 'Observar');
  const summary = h('p', { class: 'ao-summary', 'aria-live': 'polite' });
  const body = h('div', { class: 'card gr-card-list ao-table-card' });

  panel.replaceChildren(
    h('div', { class: 'gr-toolbar ao-toolbar' }, periodSeg, h('div', { class: 'gr-toolbar-actions' }, observe)),
    summary, body);

  const sortBy = (key) => {
    sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === 'nombre' ? 1 : -1 };
    paint();
  };

  function th(key, label, sign, long) {
    const active = sort.key === key;
    return h('th', { scope: 'col', class: key === 'nombre' ? 'ao-th-name' : 'num ao-th-num', 'aria-sort': active ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
      h('button', { type: 'button', class: `ao-sort${active ? ' is-active' : ''}`, onclick: () => sortBy(key), title: `Ordenar por ${long.toLowerCase()}` },
        sign ? h('span', { class: `ao-th-sign ao-t-${key}`, 'aria-hidden': 'true' }, sign) : null,
        h('span', { class: sign ? 'ao-th-label' : null }, long),
        active ? h('span', { class: 'ao-arrow', 'aria-hidden': 'true' }, sort.dir > 0 ? '↑' : '↓') : null));
  }

  function paint() {
    const group = getGroup(groupId);
    if (!group) return;
    periodSeg.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.k === ev;
      b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-selected', String(on));
    });
    const students = getStudents(groupId);
    const range = rangeFor(group, ev);
    const by = tallyByStudent(groupId, range);
    const total = tally(listObservations({ groupId, ...range }));

    summary.replaceChildren(total.total
      ? h('span', {}, h('strong', {}, plural(total.total, 'observación', 'observaciones')), ' · ', tallyEl(total, { neutral: true }) || '')
      : h('span', {}, 'Sin observaciones en este periodo.'));

    if (!students.length) {
      body.replaceChildren(h('div', { class: 'empty' }, icon('grupos', 40), h('strong', {}, 'Este grupo aún no tiene alumnado'),
        'Añade a tu alumnado para poder observarlo.'));
      return;
    }
    const zero = { positiva: 0, negativa: 0, neutra: 0, total: 0 };
    const rows = students.map((s, i) => ({ s, i, t: by[s.id] || zero }));
    rows.sort((a, b) => (sort.key === 'nombre' ? (a.i - b.i) * sort.dir : (a.t[sort.key] - b.t[sort.key]) * sort.dir || a.i - b.i));

    const num = (n, k) => h('td', { class: `num ao-cell ao-c-${k}${n ? '' : ' is-zero'}` }, n ? String(n) : '–');
    body.replaceChildren(...[
      !total.total ? h('p', { class: 'gr-hint ao-hint-empty' }, 'Toca «Observar» en clase para empezar a registrar. Verás aquí los recuentos de cada alumno.') : null,
      h('div', { class: 'gr-table-wrap' },
        h('table', { class: 'gr-table ao-table' },
          h('thead', {}, h('tr', {}, th('nombre', 'Alumno', null, 'Alumno'), COLS.map(([k, sign, long]) => th(k, long, sign, long)))),
          h('tbody', {}, rows.map(({ s, t }) => h('tr', {},
            h('th', { scope: 'row', class: 'ao-rowhead' },
              h('button', { type: 'button', class: 'ao-student', onclick: () => openStudentObservations(s.id), 'aria-label': `Ver observaciones de ${listName(s)}. ${tallyText(t)}` },
                h('span', { class: 'ao-avatar ao-avatar-sm', 'aria-hidden': 'true' }, initials(s)),
                h('span', { class: 'ao-student-name' }, listName(s)))),
            COLS.map(([k]) => num(t[k], k)))))))].filter(Boolean));
  }

  paint();
  const unsubs = ['observaciones', 'students', 'groups'].map((c) => store.subscribe(c, paint));
  return () => unsubs.forEach((u) => u());
}
