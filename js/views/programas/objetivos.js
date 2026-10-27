// Tabula · Planes y programas · pestaña Objetivos (lista de comprobación con progreso)
import { store, uid } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { safePainter } from './common.js';

export function mountObjetivos(panel, programaId) {
  let editingId = null;
  const read = () => (store.get('programas', programaId)?.objetivos || []);
  const write = (items) => store.update('programas', programaId, { objetivos: items });

  const progress = h('div', { class: 'pg-progress' });
  const list = h('ul', { class: 'pg-goals' });

  // Alta persistente (no se recrea al repintar, así no pierde el foco)
  const input = h('input', {
    class: 'input', type: 'text', id: 'pg-obj-add', maxlength: 240, autocomplete: 'off',
    placeholder: 'Añade un objetivo y pulsa Intro', 'aria-label': 'Nuevo objetivo',
  });
  const add = () => {
    const t = input.value.trim();
    if (!t) return;
    write([...read(), { id: uid(), texto: t, hecho: false }]);
    input.value = ''; input.focus();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const adder = h('div', { class: 'composer pg-goal-add' }, input,
    h('button', { type: 'button', class: 'send', 'aria-label': 'Añadir objetivo', onclick: add }, icon('plus', 18)));

  const move = (i, d) => {
    const items = read(); const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    write(items);
  };

  function row(o, i, n) {
    if (o.id === editingId) {
      const edit = h('input', { class: 'input', type: 'text', value: o.texto, maxlength: 240, 'aria-label': 'Editar objetivo', autocomplete: 'off' });
      const save = () => {
        const t = edit.value.trim();
        editingId = null; edit.blur();
        if (t && t !== o.texto) write(read().map((x) => (x.id === o.id ? { ...x, texto: t } : x))); else paint();
      };
      edit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { editingId = null; paint(); }
      });
      setTimeout(() => { edit.focus(); edit.select(); }, 0);
      return h('li', { class: 'pg-goal is-editing' }, edit,
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: save }, 'Guardar'));
    }
    return h('li', { class: `pg-goal${o.hecho ? ' is-done' : ''}` },
      h('label', { class: 'task-check pg-goal-check' },
        h('input', {
          type: 'checkbox', class: 'check', checked: !!o.hecho, 'aria-label': `Conseguido: ${o.texto}`,
          onchange: (e) => write(read().map((x) => (x.id === o.id ? { ...x, hecho: e.target.checked } : x))),
        })),
      h('button', { type: 'button', class: 'pg-goal-text', 'aria-label': `Editar objetivo: ${o.texto}`, onclick: () => { editingId = o.id; paint(); } }, o.texto),
      h('div', { class: 'pg-goal-tools' },
        h('button', { type: 'button', class: 'icon-btn pg-up', 'aria-label': `Subir: ${o.texto}`, disabled: i === 0, onclick: () => move(i, -1) }, icon('chevronDown', 18)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Bajar: ${o.texto}`, disabled: i === n - 1, onclick: () => move(i, 1) }, icon('chevronDown', 18)),
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': `Eliminar objetivo: ${o.texto}`,
          onclick: () => { const prev = read(); write(prev.filter((x) => x.id !== o.id)); toast('Objetivo eliminado', { label: 'Deshacer', run: () => write(prev) }); },
        }, icon('trash', 18))));
  }

  function paint() {
    const items = read();
    const done = items.filter((o) => o.hecho).length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    progress.replaceChildren(
      h('div', { class: 'pg-progress-text' }, h('strong', {}, `${done} de ${items.length}`), ' ', items.length === 1 ? 'objetivo conseguido' : 'objetivos conseguidos'),
      h('div', { class: 'pg-progress-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progreso de objetivos' },
        h('span', { style: { width: `${pct}%` } })));
    list.replaceChildren(...(items.length
      ? items.map((o, i) => row(o, i, items.length))
      : [h('li', { class: 'pg-rows-empty' }, 'Define qué quieres lograr este curso con el programa; los verás en la memoria.')]));
  }

  panel.replaceChildren(h('section', { class: 'card pg-list-card' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Objetivos del curso')),
    progress, list, adder));
  const repaint = safePainter(list, paint);
  paint();
  return store.subscribe('programas', repaint);
}
