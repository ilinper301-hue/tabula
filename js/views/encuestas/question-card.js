// Tabula · Encuestas · tarjeta de una pregunta del editor
import { h, icon } from '../../ui.js';
import { QUESTION_TYPES } from '../../surveys.js';
import { eicon } from './common.js';

const HINTS = {
  corta: 'Quien responda escribirá una línea de texto.',
  larga: 'Quien responda escribirá un texto largo.',
  sino: 'Quien responda elegirá Sí o No.',
  fecha: 'Quien responda elegirá una fecha en un calendario.',
};

const autogrow = (ta) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };

/** Editor de opciones: Enter añade debajo, Retroceso en una vacía la quita, flechas reordenan. */
function optionsEditor(q, changed) {
  const multiple = q.tipo === 'multiple';
  const list = h('ul', { class: 'enc-opts', 'aria-label': 'Opciones' });
  let focusIdx = null;

  const paint = () => {
    list.replaceChildren(...q.opciones.map((o, i) => row(o, i)), addRow());
    if (focusIdx !== null) {
      const f = focusIdx; focusIdx = null;
      (list.querySelector(`[data-opt="${f}"]`) || list.querySelector('.enc-opt-add input'))?.focus();
    }
  };
  const mutate = (fn, focus = null) => { fn(); focusIdx = focus; changed(); paint(); };

  function row(o, i) {
    const inp = h('input', { class: 'input enc-opt-input', value: o, dataset: { opt: i }, 'aria-label': `Opción ${i + 1}`, maxlength: '200',
      oninput: (e) => { q.opciones[i] = e.target.value; changed(); },
      onkeydown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); mutate(() => q.opciones.splice(i + 1, 0, ''), i + 1); }
        else if (e.key === 'Backspace' && !e.target.value && q.opciones.length > 1) { e.preventDefault(); mutate(() => q.opciones.splice(i, 1), Math.max(0, i - 1)); }
      } });
    const move = (d) => mutate(() => { const j = i + d; [q.opciones[i], q.opciones[j]] = [q.opciones[j], q.opciones[i]]; }, i + d);
    return h('li', { class: 'enc-opt-row' },
      h('span', { class: `enc-opt-mark${multiple ? ' sq' : ''}`, 'aria-hidden': 'true' }), inp,
      h('button', { type: 'button', class: 'icon-btn enc-mini', 'aria-label': `Subir la opción ${i + 1}`, disabled: i === 0, onclick: () => move(-1) }, eicon('up', 16)),
      h('button', { type: 'button', class: 'icon-btn enc-mini', 'aria-label': `Bajar la opción ${i + 1}`, disabled: i === q.opciones.length - 1, onclick: () => move(1) }, eicon('down', 16)),
      h('button', { type: 'button', class: 'icon-btn enc-mini', 'aria-label': `Quitar la opción ${i + 1}`, onclick: () => mutate(() => q.opciones.splice(i, 1), Math.min(i, q.opciones.length - 2)) }, icon('x', 16)));
  }
  function addRow() {
    const add = (inp) => {
      const v = inp.value.trim();
      inp.value = ''; // vacío antes de repintar: así el blur de la fila retirada no la añade otra vez
      if (!v) return;
      mutate(() => q.opciones.push(v), 'add');
    };
    const inp = h('input', { class: 'input enc-opt-input', placeholder: 'Añadir opción… (Enter)', 'aria-label': 'Añadir una opción', maxlength: '200',
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); add(inp); } },
      onblur: () => { if (inp.value.trim()) add(inp); } });
    return h('li', { class: 'enc-opt-row enc-opt-add' },
      h('span', { class: `enc-opt-mark ghost${multiple ? ' sq' : ''}`, 'aria-hidden': 'true' }), inp,
      h('button', { type: 'button', class: 'icon-btn enc-mini', 'aria-label': 'Añadir opción', onmousedown: (e) => e.preventDefault(), onclick: () => (inp.value.trim() ? add(inp) : inp.focus()) }, icon('plus', 16)));
  }
  paint();
  return list;
}

/** Editor de escala: desde 0/1, hasta 2–10 y etiquetas de los extremos. */
function scaleEditor(q, changed) {
  const e = q.escala;
  const sel = (label, values, current, onSet) => h('label', { class: 'enc-sf' }, h('span', {}, label),
    h('select', { class: 'select', onchange: (ev) => { onSet(Number(ev.target.value)); changed(); } },
      ...values.map((v) => h('option', { value: v, selected: v === current }, String(v)))));
  const txt = (label, key, ph) => h('label', { class: 'enc-sf enc-sf-wide' }, h('span', {}, label),
    h('input', { class: 'input', value: e[key] || '', maxlength: '40', placeholder: ph, oninput: (ev) => { e[key] = ev.target.value; changed(); } }));
  return h('div', { class: 'enc-scale-ed' },
    sel('Desde', [0, 1], e.min, (v) => { e.min = v; }),
    sel('Hasta', [2, 3, 4, 5, 6, 7, 8, 9, 10], e.max, (v) => { e.max = v; }),
    txt('Etiqueta del valor más bajo', 'etiquetaMin', 'Ej.: Nada'),
    txt('Etiqueta del valor más alto', 'etiquetaMax', 'Ej.: Mucho'));
}

/**
 * cb = { change(), move(dir), duplicate(), remove(), retype(tipo) }
 * El objeto q se modifica directamente; change() avisa para guardar y refrescar la vista previa.
 */
export function questionCard(q, i, n, cb) {
  const uid = `qc-${q.id}`;
  const text = h('textarea', { class: 'textarea enc-q-text', id: `${uid}-t`, rows: '1', maxlength: '400', placeholder: 'Escribe la pregunta', 'aria-label': `Enunciado de la pregunta ${i + 1}`,
    dataset: { f: 'texto' }, oninput: (e) => { q.texto = e.target.value; autogrow(e.target); cb.change(); } });
  text.value = q.texto || '';
  requestAnimationFrame(() => autogrow(text));

  // La ayuda va plegada hasta que se necesita.
  const helpBox = h('div', { class: 'enc-help' });
  const paintHelp = (open) => {
    if (!open && !q.ayuda) {
      helpBox.replaceChildren(h('button', { type: 'button', class: 'link-btn enc-help-add', onclick: () => { paintHelp(true); helpBox.querySelector('input').focus(); } }, '+ Añadir ayuda'));
    } else {
      helpBox.replaceChildren(h('input', { class: 'input', value: q.ayuda || '', maxlength: '300', placeholder: 'Ayuda opcional bajo la pregunta', 'aria-label': `Ayuda de la pregunta ${i + 1}`,
        oninput: (e) => { q.ayuda = e.target.value; cb.change(); } }));
    }
  };
  paintHelp(false);

  let body;
  if (q.tipo === 'unica' || q.tipo === 'multiple') body = optionsEditor(q, cb.change);
  else if (q.tipo === 'escala') body = scaleEditor(q, cb.change);
  else body = h('p', { class: 'enc-hint' }, HINTS[q.tipo] || '');

  return h('article', { class: 'card enc-qcard', dataset: { qid: q.id }, 'aria-label': `Pregunta ${i + 1}` },
    h('div', { class: 'enc-q-head' },
      h('span', { class: 'enc-qnum', 'aria-hidden': 'true' }, String(i + 1)),
      h('select', { class: 'select enc-type', 'aria-label': `Tipo de la pregunta ${i + 1}`, dataset: { f: 'tipo' }, onchange: (e) => cb.retype(e.target.value) },
        ...Object.entries(QUESTION_TYPES).map(([k, v]) => h('option', { value: k, selected: k === q.tipo }, v.label))),
      h('button', { type: 'button', class: 'icon-btn', dataset: { f: 'up' }, 'aria-label': `Subir la pregunta ${i + 1}`, title: 'Subir', disabled: i === 0, onclick: () => cb.move(-1) }, eicon('up')),
      h('button', { type: 'button', class: 'icon-btn', dataset: { f: 'down' }, 'aria-label': `Bajar la pregunta ${i + 1}`, title: 'Bajar', disabled: i === n - 1, onclick: () => cb.move(1) }, eicon('down'))),
    text, helpBox, body,
    h('div', { class: 'enc-q-foot' },
      h('label', { class: 'enc-req' }, h('input', { type: 'checkbox', class: 'switch', checked: !!q.obligatoria, onchange: (e) => { q.obligatoria = e.target.checked; cb.change(); } }), h('span', {}, 'Obligatoria')),
      h('span', { class: 'enc-q-actions' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Duplicar la pregunta ${i + 1}`, title: 'Duplicar', onclick: cb.duplicate }, eicon('copy')),
        h('button', { type: 'button', class: 'icon-btn enc-danger', 'aria-label': `Eliminar la pregunta ${i + 1}`, title: 'Eliminar', onclick: cb.remove }, icon('trash')))));
}
