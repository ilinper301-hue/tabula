// Tabula · Planes y programas · lista editable genérica (equipo y enlaces útiles)
// Se guarda dentro del propio programa: p[key] = [{ id, ...campos }]
import { store, uid } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { safePainter } from './common.js';

/**
 * cfg: { key, title, hint, empty, fields:[{ name, label, placeholder, required, type, maxlength }],
 *        renderMain(item) → nodos, check(values) → { error?, values? }, noun: 'compañero' }
 */
export function mountListEditor(container, programaId, cfg) {
  let editingId = null;
  const read = () => (store.get('programas', programaId)?.[cfg.key] || []);
  const write = (items) => store.update('programas', programaId, { [cfg.key]: items });

  const ul = h('ul', { class: 'pg-rows' });
  const err = h('p', { class: 'pg-error', role: 'alert', hidden: true });

  const makeInputs = (values = {}, labelPrefix = '') => cfg.fields.map((f) => h('input', {
    class: 'input', type: f.type || 'text', value: values[f.name] || '', placeholder: f.placeholder || f.label,
    maxlength: f.maxlength || 120, autocomplete: 'off', 'aria-label': `${labelPrefix}${f.label}`, dataset: { name: f.name },
  }));
  const collect = (inputs) => Object.fromEntries(inputs.map((i) => [i.dataset.name, i.value.trim()]));
  const validate = (inputs, errEl) => {
    const raw = collect(inputs);
    const miss = cfg.fields.find((f) => f.required && !raw[f.name]);
    if (miss) { errEl.textContent = `Falta: ${miss.label.toLowerCase()}.`; errEl.hidden = false; inputs.find((i) => i.dataset.name === miss.name).focus(); return null; }
    const res = cfg.check ? cfg.check(raw) : { values: raw };
    if (res.error) { errEl.textContent = res.error; errEl.hidden = false; inputs[0].focus(); return null; }
    errEl.hidden = true;
    return res.values || raw;
  };

  // --- Alta (persistente: no se recrea al repintar)
  const addInputs = makeInputs();
  const addForm = h('form', { class: 'pg-add-row', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const v = validate(addInputs, err);
    if (!v) return;
    write([...read(), { id: uid(), ...v }]);
    addInputs.forEach((i) => { i.value = ''; });
    addInputs[0].focus();
  } }, ...addInputs, h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus', 16), 'Añadir'));

  function row(item) {
    if (item.id === editingId) {
      const inputs = makeInputs(item, 'Editar ');
      const e2 = h('p', { class: 'pg-error', role: 'alert', hidden: true });
      setTimeout(() => inputs[0].focus(), 0);
      return h('li', { class: 'pg-row is-editing' },
        h('form', { class: 'pg-edit-form', novalidate: true, onsubmit: (ev) => {
          ev.preventDefault();
          const v = validate(inputs, e2);
          if (!v) return;
          editingId = null; document.activeElement?.blur();
          write(read().map((x) => (x.id === item.id ? { ...x, ...v } : x)));
        } },
        h('div', { class: 'pg-add-row' }, ...inputs),
        e2,
        h('div', { class: 'pg-actions' }, h('span', { class: 'pg-spacer' }),
          h('button', { type: 'button', class: 'btn', onclick: () => { editingId = null; paint(); } }, 'Cancelar'),
          h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar'))));
    }
    return h('li', { class: 'pg-row' },
      h('div', { class: 'pg-row-main' }, ...[].concat(cfg.renderMain(item))),
      h('button', { type: 'button', class: 'link-btn', 'aria-label': `Editar ${cfg.noun}: ${item[cfg.fields[0].name]}`, onclick: () => { editingId = item.id; paint(); } }, 'Editar'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Quitar ${cfg.noun}: ${item[cfg.fields[0].name]}`, onclick: () => {
        const prev = read();
        write(prev.filter((x) => x.id !== item.id));
        toast(`${cfg.noun[0].toUpperCase()}${cfg.noun.slice(1)} quitado`, { label: 'Deshacer', run: () => write(prev) });
      } }, icon('trash', 18)));
  }

  function paint() {
    const items = read();
    ul.replaceChildren(...(items.length ? items.map(row) : [h('li', { class: 'pg-rows-empty' }, cfg.empty)]));
  }

  container.append(h('section', { class: 'card pg-list-card' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, cfg.title)),
    cfg.hint ? h('p', { class: 'pg-hint pg-hint-block' }, cfg.hint) : null,
    ul, addForm, err));
  const repaint = safePainter(ul, paint);
  paint();
  return store.subscribe('programas', repaint);
}
