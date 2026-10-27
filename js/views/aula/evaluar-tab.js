// Tabula · En clase · pestaña «Evaluar»: abre la evaluación rápida de cualquier grupo y área
import { store } from '../../store.js';
import { h, icon, todayISO } from '../../ui.js';
import { AREAS, areaShort, areaColor, getStudents } from '../../school.js';
import { quickLevels, gradebookFor } from '../../quick-eval.js';
import { areasOfGroup, suggestedArea } from './common.js';
import { openQuickEval } from './evaluar.js';

export function create(ctx) {
  let area = '';
  const select = h('select', { class: 'select', id: 'au-area', onchange: (e) => { area = e.target.value; paint(); } });
  const openBtn = h('button', { type: 'button', class: 'btn btn-primary au-big-btn', onclick: () => openQuickEval({ groupId: ctx.groupId(), area }) }, icon('check', 20), 'Abrir evaluación rápida');
  const todayHost = h('div', { class: 'au-today-evals' });
  const el = h('div', { class: 'au-evaluar' },
    h('p', { class: 'au-ev-lead' }, 'Elige un criterio, toca a cada alumno y pon su nivel. Todo queda en el Cuaderno como una actividad de observación.'),
    h('div', { class: 'field au-area-field' }, h('label', { for: 'au-area' }, 'Área'), select),
    openBtn, todayHost);

  function paint() {
    const gid = ctx.groupId();
    const mine = areasOfGroup(gid);
    const list = [...mine, ...AREAS.filter((a) => !mine.includes(a))];
    if (!area || !list.includes(area)) area = suggestedArea(gid) || list[0];
    select.replaceChildren(...list.map((a) => h('option', { value: a, selected: a === area }, `${a}${mine.includes(a) ? '' : ''}`)));
    select.value = area;
    // Evaluaciones de hoy en este grupo
    const hoy = todayISO(); const total = getStudents(gid).length;
    const rows = [];
    for (const a of list) {
      const gb = gradebookFor(gid, a); if (!gb) continue;
      for (const act of store.list('activities').filter((x) => x.gradebookId === gb.id && x.origen === 'rapida' && x.fecha === hoy)) {
        const cid = (act.criterioIds || [])[0]; const n = Object.keys(quickLevels(gb.id, cid, hoy)).length;
        const cr = (gb.criterios || []).find((c) => c.id === cid);
        rows.push(h('li', {}, h('button', { type: 'button', class: 'au-today-row', onclick: () => openQuickEval({ groupId: gid, area: a, criterioId: cid }) },
          h('span', { class: `chip ${areaColor(a)}` }, areaShort(a)), h('span', { class: 'au-today-code' }, cr?.codigo || 'Criterio'),
          h('span', { class: 'au-sub' }, `${n}/${total} evaluados`))));
      }
    }
    todayHost.replaceChildren(...(rows.length ? [h('div', { class: 'section-label' }, 'Evaluado hoy'), h('ul', { class: 'au-today-list' }, rows)] : []));
  }
  paint();
  return { el, setGroup() { area = ''; paint(); }, refresh() { paint(); }, destroy() {} };
}
