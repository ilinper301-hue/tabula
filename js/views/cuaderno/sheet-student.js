// Tabula · Cuaderno · desglose de la nota de un alumno y ajuste manual
import { h, toast, openSheet } from '../../ui.js';
import { listName } from '../../school.js';
import { parseGradeInput, formatGrade, competenciaOf, toLevel, EVALUACIONES } from '../../grading.js';
import { saveAdjustment } from './model.js';
import { critRubric } from '../../informes.js';
import { levelChip, num, plural, trunc, field } from './common.js';
import { getGroup } from '../../school.js';
import { listObservations, tally } from '../../observations.js';
import { rangeFor, signBadge, whenLabel, obsTitle, tallyEl } from '../anecdotario/common.js';

export function openStudentSheet({ ctx, student, ev }) {
  const { gb, all, visible } = ctx;
  const res = ctx.results[student.id];
  const evLabel = EVALUACIONES.find((e) => e.id === ev)?.label || '';

  const row = (label, sub, v, count, rubric) => h('div', { class: 'cb-bk-row', title: rubric || null },
    h('div', { class: 'cb-bk-label' }, h('span', {}, label), sub ? h('small', {}, sub) : null,
      rubric ? h('small', { class: 'cb-bk-rub' }, rubric) : null),
    h('div', { class: 'cb-bk-val' },
      count != null ? h('small', {}, plural(count, 'actividad', 'actividades')) : null,
      h('strong', {}, v == null ? '—' : num(v)), levelChip(v) || h('span', { class: 'cb-chip-ph' })));

  const countFor = (pred) => visible.filter((a) => pred(a) && res.porActividad[a.id] != null).length;
  const rows = [];
  if (gb.modo === 'criterios') {
    rows.push(h('h3', { class: 'section-label' }, 'Por criterio de evaluación'));
    (gb.criterios || []).forEach((cr) => {
      const lv = toLevel(res.porCriterio[cr.id]);
      rows.push(row(cr.codigo || '·', trunc(cr.descripcion, 70), res.porCriterio[cr.id], countFor((a) => (a.criterioIds || []).includes(cr.id)), lv ? critRubric(cr)[lv] : null));
    });
    const ces = [...new Set((gb.criterios || []).map((c) => competenciaOf(c.codigo)).filter(Boolean))].sort((a, b) => a - b);
    if (ces.length) {
      rows.push(h('h3', { class: 'section-label cb-sec' }, 'Por competencia específica'));
      ces.forEach((n) => rows.push(row(`CE${n}`, null, res.porCompetencia[n])));
    }
  } else {
    rows.push(h('h3', { class: 'section-label' }, 'Por instrumento'));
    (gb.instrumentos || []).forEach((ins) => rows.push(row(ins.nombre, `${ins.peso} %`, res.porInstrumento[ins.id], countFor((a) => a.instrumentoId === ins.id))));
  }
  if (res.porEvaluacion) {
    rows.push(h('h3', { class: 'section-label cb-sec' }, 'Por evaluación'));
    res.porEvaluacion.forEach((v, i) => rows.push(row(`${i + 1}.ª evaluación`, null, v)));
  }

  // Observaciones del anecdotario en este periodo (solo informativas: no entran en la nota)
  const group = getGroup(gb.groupId);
  const period = group ? listObservations({ studentId: student.id, ...rangeFor(group, ev) }) : [];
  const obsBlock = h('div', { class: 'cb-obs-block' },
    h('h3', { class: 'section-label cb-sec' }, 'Observaciones en este periodo'),
    period.length
      ? h('div', { class: 'ao-peek' },
        h('p', { class: 'cb-hint' }, plural(period.length, 'observación', 'observaciones'), ' · ', tallyEl(tally(period), { neutral: true }) || '', period.length > 5 ? ' · últimas 5' : ''),
        h('ul', { class: 'ao-peek-list' }, period.slice(0, 5).map((o) => h('li', { class: `ao-peek-item ao-t-${o.tipo}` },
          signBadge(o.tipo),
          h('span', { class: 'ao-peek-text' }, h('strong', {}, o.etiqueta || obsTitle(o)), o.etiqueta && o.texto ? h('span', {}, ` · ${trunc(o.texto, 70)}`) : null),
          h('span', { class: 'ao-peek-when' }, whenLabel(o))))))
      : h('p', { class: 'cb-hint' }, 'Sin observaciones en este periodo.'),
    h('button', {
      type: 'button', class: 'link-btn ao-peek-link',
      onclick: () => { close(); import('../grupos/sheets.js').then((m) => m.openFicha(student.id)); },
    }, 'Ver ficha del alumno'));

  const adjInput = h('input', {
    class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', maxlength: 5, placeholder: 'Ej. 7,5 o NT',
    value: res.ajustada ? formatGrade(res.nota, gb.escala === 'niveles' ? 'niveles' : 'numerica') : '',
  });
  const err = h('p', { class: 'cb-error', role: 'alert', hidden: true });
  const apply = (e) => {
    e && e.preventDefault();
    const v = parseGradeInput(adjInput.value, gb);
    if (v === undefined || v === null) { err.textContent = 'Escribe una nota de 0 a 10 o IN, SU, BI, NT, SB'; err.hidden = false; adjInput.focus(); return; }
    saveAdjustment(gb, ev, student.id, v);
    close();
    toast(`Nota ajustada a ${num(v)}`, { label: 'Deshacer', run: () => saveAdjustment(gb, ev, student.id, res.ajustada ? res.nota : null) });
  };
  const remove = () => {
    const prev = res.nota;
    saveAdjustment(gb, ev, student.id, null);
    close();
    toast('Ajuste quitado', { label: 'Deshacer', run: () => saveAdjustment(gb, ev, student.id, prev) });
  };

  const content = h('div', { class: 'cb-bk' },
    h('div', { class: 'cb-bk-top' },
      h('div', {}, h('div', { class: 'cb-bk-big' }, res.nota == null ? '—' : num(res.nota)),
        h('div', { class: 'cb-bk-meta' }, res.ajustada ? `Nota ajustada · calculada ${res.calc == null ? '—' : num(res.calc)}` : 'Nota calculada')),
      levelChip(res.nota, 'cb-chip-lg')),
    h('p', { class: 'cb-hint' }, `${evLabel} · ${plural(res.evaluadas, 'actividad evaluada', 'actividades evaluadas')} de ${ev === 'final' ? all.length : visible.length}.`),
    ...rows,
    obsBlock,
    h('form', { class: 'cb-adjust', onsubmit: apply, novalidate: true },
      h('h3', { class: 'section-label cb-sec' }, 'Ajustar nota'),
      field('Nota final del alumno en esta evaluación', adjInput, 'Sustituye a la nota calculada; las actividades no cambian.'),
      err,
      h('div', { class: 'cb-actions' },
        res.ajustada ? h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: remove }, 'Quitar ajuste') : null,
        h('span', { class: 'cb-spacer' }),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Ajustar nota'))));

  const close = openSheet(listName(student), content);
  return close;
}
