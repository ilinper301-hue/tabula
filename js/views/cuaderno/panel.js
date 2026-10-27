// Tabula · Cuaderno · panel inferior de puntuación rápida (táctil) y de rúbricas.
// No es modal: la rejilla sigue visible y se puede ir bajando por la columna con «Anterior / Siguiente».
import { h, icon } from '../../ui.js';
import { listName } from '../../school.js';
import {
  LEVELS, LEVEL_LABELS, levelValue, toLevel, formatGrade, entryScore,
} from '../../grading.js';
import { saveEntry } from './model.js';
import { LEVEL_CLASS, trunc } from './common.js';

let autoAdvance = true; // recordado mientras dure la sesión

export function createPanel({ getCtx, onFocusCell }) {
  const root = h('section', { class: 'cb-panel', role: 'dialog', 'aria-label': 'Puntuar', 'aria-modal': 'false' });
  let st = null;      // { actId, i }
  let half = false;   // ",5" activo
  let mounted = false;

  // Reserva espacio bajo la rejilla igual al alto del panel y, solo entonces, lleva la celda a la vista.
  const setPad = (cell) => requestAnimationFrame(() => {
    if (!st) return;
    document.documentElement.style.setProperty('--cb-panel-h', `${root.offsetHeight}px`);
    onFocusCell(cell, true);
  });

  function close() {
    if (!st) return;
    st = null;
    root.classList.remove('open');
    document.documentElement.style.removeProperty('--cb-panel-h');
    onFocusCell(null);
    root.remove(); mounted = false;
  }

  function open(actId, i) {
    st = { actId, i };
    if (!mounted) { document.body.append(root); mounted = true; }
    render();
    requestAnimationFrame(() => root.classList.add('open'));
  }

  function current() {
    if (!st) return null;
    const C = getCtx();
    const act = C.all.find((a) => a.id === st.actId);
    const stu = C.students[st.i];
    if (!act || !stu) return null;
    return { C, act, stu, entry: C.gradesByAct[act.id]?.notas?.[stu.id] || {} };
  }

  function move(delta) {
    const C = getCtx();
    const ni = st.i + delta;
    if (ni < 0 || ni >= C.students.length) return;
    st.i = ni;
    render();
  }

  const save = (patch) => { const cur = current(); if (cur) saveEntry(cur.act.id, cur.stu.id, patch); };

  /** Tras elegir un valor: avanza al siguiente alumno si "Pasar al siguiente" está activo. */
  function afterPick() {
    const C = getCtx();
    if (autoAdvance && st.i < C.students.length - 1) st.i += 1;
    render();
  }

  // ---------- Partes ----------
  function header(cur) {
    const { C, act, stu } = cur;
    return h('div', { class: 'cb-panel-head' },
      h('button', { type: 'button', class: 'icon-btn cb-pn', 'aria-label': 'Alumno anterior', disabled: st.i === 0, onclick: () => move(-1) }, icon('chevronLeft')),
      h('div', { class: 'cb-panel-who' },
        h('span', { class: 'cb-panel-name' }, listName(stu)),
        h('span', { class: 'cb-panel-sub' }, `${st.i + 1} de ${C.students.length} · ${trunc(act.nombre, 34)}`)),
      h('button', { type: 'button', class: 'icon-btn cb-pn', 'aria-label': 'Alumno siguiente', disabled: st.i === C.students.length - 1, onclick: () => move(1) }, icon('chevronRight')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar panel', onclick: close }, icon('x')));
  }

  function commentField(cur) {
    const input = h('input', {
      class: 'input cb-panel-comment', type: 'text', maxlength: 300, placeholder: 'Comentario (opcional)',
      'aria-label': 'Comentario', value: cur.entry.c || '',
      onchange: () => save({ c: input.value.trim() }),
    });
    return input;
  }

  function levelPad(cur) {
    const v = cur.entry.v;
    const lv = toLevel(v);
    return h('div', { class: 'cb-levels' }, LEVELS.map((code) => h('button', {
      type: 'button', class: `cb-lvbtn chip-${code}`, 'aria-pressed': String(lv === code && v != null),
      onclick: () => { save({ v: levelValue(code, cur.C.gb) }); afterPick(); },
    }, h('strong', {}, code), h('small', {}, LEVEL_LABELS[code]))));
  }

  function numberPad(cur) {
    const v = cur.entry.v;
    const btns = [];
    for (let n = 0; n <= 10; n++) {
      const val = half && n < 10 ? n + 0.5 : n;
      btns.push(h('button', {
        type: 'button', class: 'cb-numbtn', 'aria-pressed': String(typeof v === 'number' && Math.abs(v - val) < 1e-9),
        onclick: () => { save({ v: val }); afterPick(); },
      }, formatGrade(val, 'numerica')));
    }
    btns.push(h('button', {
      type: 'button', class: 'cb-numbtn cb-half', 'aria-pressed': String(half), title: 'Sumar medio punto',
      onclick: () => { half = !half; render(); },
    }, ',5'));
    return h('div', { class: 'cb-nums' }, btns);
  }

  function rubricPad(cur) {
    const { act, entry } = cur;
    const rub = act.rubrica || { niveles: 4, aspectos: [] };
    const N = rub.niveles || 4;
    const r = Array.isArray(entry.r) ? entry.r.slice() : [];
    while (r.length < rub.aspectos.length) r.push(null);
    const score = entryScore(act, entry);
    return h('div', { class: 'cb-rubric' },
      rub.aspectos.map((a, idx) => h('div', { class: 'cb-asp' },
        h('div', { class: 'cb-asp-name' }, h('span', {}, a.nombre || `Aspecto ${idx + 1}`), h('small', {}, `peso ${a.peso ?? 1}`)),
        h('div', { class: 'cb-asp-btns', role: 'group', 'aria-label': a.nombre || `Aspecto ${idx + 1}` },
          Array.from({ length: N }, (_, k) => k + 1).map((lvl) => h('button', {
            type: 'button', class: 'cb-numbtn', 'aria-pressed': String(r[idx] === lvl),
            'aria-label': `Nivel ${lvl} de ${N}`,
            onclick: () => { const nr = r.slice(); nr[idx] = r[idx] === lvl ? null : lvl; save({ r: nr }); render(); },
          }, String(lvl)))))),
      h('div', { class: 'cb-rubric-score' }, h('span', {}, 'Nota de la rúbrica'),
        h('strong', {}, score == null ? '—' : `${formatGrade(score, 'numerica')} · ${toLevel(score)}`)));
  }

  function render() {
    const cur = current();
    if (!cur) { close(); return; }
    const { act, entry } = cur;
    const isRub = act.tipo === 'rubrica';
    const body = isRub ? rubricPad(cur) : (cur.C.gb.escala === 'niveles' ? levelPad(cur) : numberPad(cur));
    const foot = h('div', { class: 'cb-panel-foot' },
      isRub ? null : h('button', {
        type: 'button', class: 'btn btn-sm', disabled: entry.v == null, onclick: () => { save({ v: null }); render(); },
      }, 'Borrar nota'),
      isRub ? h('button', {
        type: 'button', class: 'btn btn-sm', disabled: !Array.isArray(entry.r), onclick: () => { save({ r: null }); render(); },
      }, 'Borrar rúbrica') : null,
      h('label', { class: 'cb-auto' },
        h('input', { type: 'checkbox', checked: autoAdvance, onchange: (e) => { autoAdvance = e.target.checked; } }),
        h('span', {}, 'Pasar al siguiente')));
    root.replaceChildren(header(cur), body, commentField(cur), foot);
    onFocusCell({ actId: act.id, studentId: cur.stu.id }, false);
    setPad({ actId: act.id, studentId: cur.stu.id });
  }

  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });

  return {
    open, close, isOpen: () => !!st,
    /** Tras repintar la rejilla: vuelve a marcar la celda o cierra si la actividad ya no existe. */
    sync() { if (st) render(); },
    refresh() { if (st) render(); },
  };
}
