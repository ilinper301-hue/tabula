// Tabula · Cuaderno · la rejilla (alumnado × actividades) con entrada rápida de notas.
//
// createGrid(ctx, opts) devuelve { el, update(ctx), setActive(actId, studentId), clearActive(), reveal(actId, studentId) }.
// Los cálculos vienen siempre de grading.js (ctx.results ya trae computeGroup). `update` solo cambia textos y
// valores de las celdas existentes, así que NUNCA pierde el foco ni el cursor de la celda en edición.
import { h, toast } from '../../ui.js';
import { listName, initials, getGroup } from '../../school.js';
import {
  formatGrade, parseGradeInput, entryScore, activityMean, toLevel, wmean, competenciaOf,
} from '../../grading.js';
import { saveEntry } from './model.js';
import { levelChip, num, shortDate, trunc } from './common.js';
import { tallyByStudent } from '../../observations.js';
import { rangeFor, tallyEl, tallyText } from '../anecdotario/common.js';

const BAD_MSG = 'Escribe una nota de 0 a 10 o IN, SU, BI, NT, SB';

/** Columnas según la vista: actividades, criterios o competencias. */
export function columnsFor(ctx, vista) {
  const { gb } = ctx;
  if (vista === 'criterios') return (gb.criterios || []).map((cr) => ({ kind: 'crit', cr }));
  if (vista === 'competencias') {
    const ces = [...new Set((gb.criterios || []).map((c) => competenciaOf(c.codigo)).filter(Boolean))].sort((a, b) => a - b);
    return ces.map((n) => ({ kind: 'ce', n }));
  }
  return ctx.visible.map((act) => ({ kind: 'act', act }));
}

export function createGrid(initialCtx, opts) {
  let C = initialCtx;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const students = C.students;
  const cols = columnsFor(C, opts.vista);
  const editable = cols.length > 0 && cols[0].kind === 'act';
  const refreshers = [];
  const matrix = students.map(() => []);   // elementos enfocables por fila
  const cells = new Map();                  // `${actId}|${studentId}` → td
  let obsMap = {};                          // recuento de observaciones por alumno (periodo seleccionado)

  // ---------- Cabecera ----------
  const thead = h('thead', {}, h('tr', {},
    h('th', { class: 'cb-corner', scope: 'col' }, h('span', {}, 'Alumnado'), h('span', { class: 'cb-corner-n' }, String(students.length))),
    cols.map(headerCell),
    h('th', {
      class: 'cb-obs-h', scope: 'col',
      title: 'Observaciones del periodo: positivas (+) y a mejorar (−). Solo informativas: no cambian la nota.',
    }, h('span', { class: 'cb-th-name' }, 'Obs.')),
    h('th', { class: 'cb-res-h', scope: 'col' }, h('span', { class: 'cb-th-name' }, 'Nota'), resMeanEl())));

  function resMeanEl() {
    const el = h('span', { class: 'cb-th-mean', title: 'Media del grupo' });
    refreshers.push(() => {
      const m = wmean(students.map((s) => ({ v: C.results[s.id]?.nota, w: 1 })));
      el.textContent = m == null ? '' : `Media ${num(m)}`;
    });
    return el;
  }

  function tagFor(act) {
    const { gb } = C;
    const tags = [];
    if (gb.modo === 'criterios') {
      const codes = (act.criterioIds || []).map((id) => (gb.criterios || []).find((c) => c.id === id)?.codigo).filter(Boolean);
      tags.push(codes.length
        ? h('span', { class: 'chip t6 cb-tag', title: codes.join(', ') }, trunc(codes.slice(0, 2).join(' '), 12) + (codes.length > 2 ? ` +${codes.length - 2}` : ''))
        : h('span', { class: 'chip cb-lv-in cb-tag', title: 'Sin criterios: no cuenta para la nota' }, 'Sin criterio'));
    } else {
      const ins = (gb.instrumentos || []).find((i) => i.id === act.instrumentoId);
      tags.push(ins
        ? h('span', { class: 'chip t2 cb-tag', title: ins.nombre }, trunc(ins.nombre, 13))
        : h('span', { class: 'chip cb-lv-in cb-tag', title: 'Sin instrumento: no cuenta para la nota' }, 'Sin instr.'));
    }
    if (act.tipo === 'rubrica') tags.push(h('span', { class: 'chip t4 cb-tag' }, 'Rúbrica'));
    return tags;
  }

  function headerCell(col) {
    if (col.kind === 'act') {
      const act = col.act;
      const mean = h('span', { class: 'cb-th-mean' });
      refreshers.push(() => {
        const a = C.visible.find((x) => x.id === act.id) || act;
        const m = activityMean(a, C.gradesByAct[act.id], students.map((s) => s.id));
        mean.textContent = m == null ? '' : `Media ${num(m)}`;
      });
      return h('th', { class: 'cb-th', scope: 'col' },
        h('button', { type: 'button', class: 'cb-th-btn', title: `${act.nombre} · editar actividad`, onclick: () => opts.onActivity(act) },
          h('span', { class: 'cb-th-name' }, act.nombre),
          h('span', { class: 'cb-th-date' }, shortDate(act.fecha)),
          h('span', { class: 'cb-th-tags' }, tagFor(act)),
          mean));
    }
    const isCe = col.kind === 'ce';
    const label = isCe ? `CE${col.n}` : col.cr.codigo || '—';
    const title = isCe ? `Competencia específica ${col.n}` : `${col.cr.codigo} ${col.cr.descripcion || ''}`.trim();
    const mean = h('span', { class: 'cb-th-mean' });
    refreshers.push(() => {
      const m = wmean(students.map((s) => ({ v: valueOfCol(col, C.results[s.id]), w: 1 })));
      mean.textContent = m == null ? '' : `Media ${num(m)}`;
    });
    return h('th', { class: 'cb-th cb-th-ro', scope: 'col', title },
      h('div', { class: 'cb-th-static' }, h('span', { class: 'cb-th-name cb-th-code' }, label),
        isCe ? null : h('span', { class: 'cb-th-date' }, `peso ${col.cr.peso ?? 1}`), mean));
  }

  const valueOfCol = (col, res) => (!res ? null : col.kind === 'crit' ? res.porCriterio?.[col.cr.id] : res.porCompetencia?.[col.n]);

  // ---------- Celdas ----------
  function nameCell(stu) {
    return h('td', { class: 'cb-name' },
      h('button', { type: 'button', class: 'cb-student', title: 'Ver el desglose de la nota', onclick: () => opts.onBreakdown(stu) },
        h('span', { class: 'avatar cb-avatar', 'aria-hidden': 'true' }, initials(stu)),
        h('span', { class: 'cb-student-name' }, listName(stu))));
  }

  /** Celda editable de tipo "nota": un <input> real. */
  function noteCell(act, stu, r, c) {
    const input = h('input', {
      class: 'cb-in', type: 'text', autocomplete: 'off', spellcheck: 'false', maxlength: 5, placeholder: '·',
      inputmode: coarse ? 'none' : (C.gb.escala === 'niveles' ? 'text' : 'decimal'),
      readonly: coarse ? true : null, enterkeyhint: 'next',
      'aria-label': `${listName(stu)} – ${act.nombre}`, dataset: { r, c },
    });
    input._act = act; input._stu = stu;
    const td = h('td', { class: 'cb-cell' }, input, h('span', { class: 'cb-dot', 'aria-hidden': 'true' }));
    cells.set(`${act.id}|${stu.id}`, td);
    matrix[r][c] = input;
    refreshers.push(() => {
      const entry = C.gradesByAct[act.id]?.notas?.[stu.id];
      const v = entryScore(C.all.find((a) => a.id === act.id) || act, entry);
      if (document.activeElement !== input) input.value = formatGrade(v, C.gb.escala);
      input.dataset.lv = toLevel(v) || '';
      td.classList.toggle('has-c', !!entry?.c);
      td.title = entry?.c ? `Comentario: ${entry.c}` : '';
    });
    return td;
  }

  /** Celda de rúbrica: botón con la nota calculada que abre el panel de puntuación. */
  function rubricCell(act, stu, r, c) {
    const btn = h('button', {
      type: 'button', class: 'cb-rub', dataset: { r, c }, 'aria-label': `${listName(stu)} – ${act.nombre} (rúbrica)`,
      onclick: () => opts.onOpenPanel(act, r),
    });
    btn._act = act; btn._stu = stu;
    const td = h('td', { class: 'cb-cell cb-cell-rub' }, btn, h('span', { class: 'cb-dot', 'aria-hidden': 'true' }));
    cells.set(`${act.id}|${stu.id}`, td);
    matrix[r][c] = btn;
    refreshers.push(() => {
      const entry = C.gradesByAct[act.id]?.notas?.[stu.id];
      const v = entryScore(C.all.find((a) => a.id === act.id) || act, entry);
      btn.textContent = v == null ? '—' : formatGrade(v, C.gb.escala);
      btn.dataset.lv = toLevel(v) || '';
      td.classList.toggle('has-c', !!entry?.c);
      td.title = entry?.c ? `Comentario: ${entry.c}` : '';
    });
    return td;
  }

  function readonlyCell(col, stu) {
    const span = h('span', { class: 'cb-ro' });
    refreshers.push(() => {
      const v = valueOfCol(col, C.results[stu.id]);
      span.textContent = v == null ? '' : formatGrade(v, C.gb.escala);
      span.dataset.lv = toLevel(v) || '';
    });
    return h('td', { class: 'cb-cell cb-cell-ro' }, span);
  }

  /** Columna de solo lectura con el recuento del anecdotario (no entra en la navegación por teclado). */
  function obsCell(stu) {
    const box = h('span', { class: 'cb-obs-v' });
    const td = h('td', { class: 'cb-cell cb-cell-ro cb-obs' }, box);
    refreshers.push(() => {
      const t = obsMap[stu.id];
      td.title = t ? tallyText(t) : 'Sin observaciones en este periodo';
      box.replaceChildren(...(tallyEl(t) ? [tallyEl(t)] : [h('span', { class: 'cb-obs-none', 'aria-label': 'Sin observaciones' }, '–')]));
    });
    return td;
  }

  function resultCell(stu, r, c) {
    const numEl = h('span', { class: 'cb-res-n' });
    const chipSlot = h('span', { class: 'cb-res-chip' });
    const adj = h('span', { class: 'cb-adj', title: 'Nota ajustada a mano', hidden: true }, 'aj.');
    const btn = h('button', {
      type: 'button', class: 'cb-res', title: 'Ver desglose y ajustar la nota', dataset: { r, c },
      'aria-label': `Nota de ${listName(stu)}`, onclick: () => opts.onBreakdown(stu),
    }, h('span', { class: 'cb-res-top' }, numEl, adj), chipSlot);
    matrix[r][c] = btn;
    refreshers.push(() => {
      const res = C.results[stu.id];
      const n = res?.nota;
      numEl.textContent = n == null ? '—' : num(n);
      chipSlot.replaceChildren(...(levelChip(n) ? [levelChip(n)] : []));
      adj.hidden = !res?.ajustada;
    });
    return h('td', { class: 'cb-resc' }, btn);
  }

  const tbody = h('tbody', {}, students.map((stu, r) => h('tr', { dataset: { sid: stu.id } },
    nameCell(stu),
    cols.map((col, c) => {
      if (col.kind === 'act') return col.act.tipo === 'rubrica' ? rubricCell(col.act, stu, r, c) : noteCell(col.act, stu, r, c);
      return readonlyCell(col, stu);
    }),
    obsCell(stu),
    resultCell(stu, r, cols.length))));

  const table = h('table', { class: 'cb-table', 'aria-label': 'Cuaderno de evaluación' }, thead, tbody);
  const el = h('div', { class: `cb-gridwrap${C.gb.escala === 'niveles' ? ' cb-niveles' : ''}`, tabindex: '-1' }, table);

  // ---------- Guardar una celda ----------
  const msg = () => toast(BAD_MSG);

  /** 'ok' | 'same' | 'bad'. */
  function commit(input) {
    const act = input._act, stu = input._stu;
    if (!act || input.readOnly) return 'same';
    const parsed = parseGradeInput(input.value, C.gb);
    const stored = C.gradesByAct[act.id]?.notas?.[stu.id]?.v ?? null;
    if (parsed === undefined) return 'bad';
    if (parsed === stored) { input.value = formatGrade(stored, C.gb.escala); return 'same'; }
    saveEntry(act.id, stu.id, { v: parsed });
    input.value = formatGrade(parsed, C.gb.escala);
    return 'ok';
  }
  const revert = (input) => {
    const v = C.gradesByAct[input._act.id]?.notas?.[input._stu.id]?.v ?? null;
    input.value = formatGrade(v, C.gb.escala);
  };
  const shake = (input) => {
    input.classList.remove('cb-bad'); void input.offsetWidth; input.classList.add('cb-bad');
    setTimeout(() => input.classList.remove('cb-bad'), 450);
    msg(); input.select();
  };

  const focusAt = (r, c) => { const t = matrix[r]?.[c]; if (!t) return false; t.focus(); return true; };

  el.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t.classList?.contains('cb-in') && !t.readOnly) { t._fresh = true; t.select(); }
  });
  el.addEventListener('mouseup', (e) => {
    if (e.target._fresh) { e.preventDefault(); e.target._fresh = false; }
  });
  el.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!t.classList?.contains('cb-in') || t.readOnly) return;
    if (commit(t) === 'bad') { revert(t); t.classList.remove('cb-bad'); msg(); }
  });
  el.addEventListener('dblclick', (e) => {
    const t = e.target;
    if (!coarse && t.classList?.contains('cb-in')) opts.onOpenPanel(t._act, +t.dataset.r);
  });
  el.addEventListener('click', (e) => {
    const t = e.target;
    if (coarse && t.classList?.contains('cb-in')) opts.onOpenPanel(t._act, +t.dataset.r);
  });

  el.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.dataset?.r === undefined || e.ctrlKey || e.metaKey || e.altKey) return;
    const r = +t.dataset.r, c = +t.dataset.c;
    const isInput = t.tagName === 'INPUT';
    const ok = () => { if (!isInput || t.readOnly) return true; const s = commit(t); if (s === 'bad') { shake(t); return false; } return true; };
    const last = students.length - 1;
    const go = (fn) => { e.preventDefault(); if (ok()) fn(); };
    switch (e.key) {
      case 'Enter':
        if (!isInput) return;
        go(() => {
          if (e.shiftKey) { if (r > 0) focusAt(r - 1, c); }
          else if (r < last) focusAt(r + 1, c);
          else if (matrix[0]?.[c + 1] && matrix[0][c + 1].classList.contains('cb-in')) focusAt(0, c + 1);
        });
        break;
      case 'ArrowDown': go(() => { if (r < last) focusAt(r + 1, c); }); break;
      case 'ArrowUp': go(() => { if (r > 0) focusAt(r - 1, c); }); break;
      case 'ArrowLeft':
        if (isInput && t.selectionStart !== 0) return;
        go(() => { if (c > 0) focusAt(r, c - 1); });
        break;
      case 'ArrowRight':
        if (isInput && t.selectionEnd !== t.value.length) return;
        go(() => { if (matrix[r][c + 1]) focusAt(r, c + 1); });
        break;
      case 'Tab': {
        if (!t._act) return;
        const dir = e.shiftKey ? -1 : 1;
        const width = matrix[r].length;
        let nr = r, nc = c + dir;
        if (nc >= width - 1) { nr = r + 1; nc = 0; }   // la última columna (Nota) se salta con Tab
        if (nc < 0) { nr = r - 1; nc = width - 2; }
        if (nr < 0 || nr > last || !matrix[nr][nc]) return; // fuera de la rejilla: Tab normal
        go(() => focusAt(nr, nc));
        break;
      }
      case 'F2':
        if (t._act) { e.preventDefault(); if (ok()) opts.onOpenPanel(t._act, r); }
        break;
      case 'Escape':
        if (isInput && !t.readOnly) { e.preventDefault(); revert(t); t.select(); }
        break;
      default:
    }
  });

  // ---------- API ----------
  let activeTd = null;
  const api = {
    el,
    /** Refresca valores y resultados sin tocar la estructura ni la celda enfocada. */
    update(ctx) {
      C = ctx;
      const group = getGroup(C.gb && C.gb.groupId);
      obsMap = group ? tallyByStudent(group.id, rangeFor(group, C.ev)) : {};
      refreshers.forEach((f) => f());
    },
    setActive(actId, studentId) {
      activeTd?.classList.remove('cb-active');
      activeTd = cells.get(`${actId}|${studentId}`) || null;
      activeTd?.classList.add('cb-active');
    },
    clearActive() { activeTd?.classList.remove('cb-active'); activeTd = null; },
    /** Lleva la celda a la vista (respeta las columnas fijas gracias a scroll-padding). */
    reveal(actId, studentId) {
      const td = cells.get(`${actId}|${studentId}`);
      if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
    /** ¿Hay una celda de la rejilla con el foco? */
    hasFocus: () => el.contains(document.activeElement) && document.activeElement !== el,
    rows: students.length,
  };
  api.update(C);
  return api;
}
