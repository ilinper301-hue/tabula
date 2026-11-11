// Tabula · barra de contexto compartida por Cuaderno y Planificación (rediseño, fase 3).
//
//   contextBar({ group, area, ev, onOpen })  → <button class="ctx-bar">
//     Una sola fila «1º Demo · Matemáticas · 1.ª ev. ▾» que va en la línea superior de la cabecera
//     (así no ocupa un piso propio). Al tocarla abre la hoja.
//
//   openContextSheet({ groups, state, evs, areasFor, dataLabel, onChange })  → close()
//     Hoja con Grupo · Evaluación · Área (la lista larga, al final). Cada toque aplica el cambio en el acto (onChange navega)
//     y la hoja sigue abierta para cambiar más cosas; «Listo» o ✕ la cierran.
//     · state     { groupId, area, ev }
//     · evs       evaluaciones que se ofrecen (['1','2','3','final'] o sin 'final')
//     · areasFor  (groupId) → áreas con datos de ese grupo (cuaderno o situaciones)
//     · dataLabel texto para las áreas sin datos («sin cuaderno», «sin situaciones»)
import { h, icon, openSheet } from '../ui.js';
import { AREAS, areaShort, areaColor } from '../school.js';
import { contextParts, contextAria, evShort, evLong, areaOptions, pickArea, remember } from '../contexto-model.js';

export function contextBar({ group = '', area = '', ev = null, onOpen }) {
  const parts = contextParts({ group, area: area ? areaShort(area) : '', ev });
  return h('button', {
    type: 'button', class: 'ctx-bar', 'aria-haspopup': 'dialog',
    'aria-label': contextAria({ group, area, ev: ev || null }), onclick: onOpen,
  },
  area ? h('span', { class: `ctx-dot ${areaColor(area)}`, 'aria-hidden': 'true' }) : null,
  h('span', { class: 'ctx-text' }, parts.flatMap((p, i) => [i ? h('span', { class: 'ctx-sep', 'aria-hidden': 'true' }, ' · ') : null,
    h('span', { class: `ctx-part${i === 1 ? ' ctx-area' : ''}` }, p)]).filter(Boolean)),
  icon('chevronDown', 16, 'ctx-chev'));
}

export function openContextSheet({ groups = [], state, evs = ['1', '2', '3', 'final'], areasFor = () => [], dataLabel = 'sin datos', onChange }) {
  const cur = { ...state };
  const opener = document.activeElement;
  const body = h('div', { class: 'ctx-sheet' });

  const apply = (patch) => {
    Object.assign(cur, patch);
    remember(cur);
    onChange({ ...cur });
    paint(Object.keys(patch)[0]);
  };

  const option = (key, value, pressed, content, extra = {}) => h('button', {
    type: 'button', class: `ctx-opt${extra.className ? ' ' + extra.className : ''}`, 'aria-pressed': String(pressed),
    dataset: { k: key, v: String(value) }, title: extra.title || null,
    onclick: () => { if (!pressed) apply(extra.patch || { [key]: value }); },
  }, content);

  function section(title, id, content, note) {
    return h('section', { class: 'ctx-sec', 'aria-labelledby': id },
      h('h3', { class: 'ctx-sec-title', id }, title), note ? h('p', { class: 'ctx-note' }, note) : null, content);
  }

  function paint(focusKey) {
    const parts = [];
    if (groups.length > 1) {
      parts.push(section('Grupo', 'ctx-h-grupo', h('div', { class: 'ctx-opts', role: 'group', 'aria-label': 'Grupo' },
        groups.map((g) => option('groupId', g.id, g.id === cur.groupId, g.nombre, {
          patch: { groupId: g.id, area: pickArea({ current: cur.area, withData: areasFor(g.id), all: AREAS }) },
        })))));
    }
    if (evs.length > 1) {
      parts.push(section('Evaluación', 'ctx-h-ev', h('div', { class: 'segmented ctx-ev', role: 'group', 'aria-label': 'Evaluación' },
        evs.map((e) => h('button', {
          type: 'button', 'aria-selected': String(e === cur.ev), 'aria-pressed': String(e === cur.ev), 'aria-label': evLong(e),
          dataset: { k: 'ev', v: e }, onclick: () => { if (e !== cur.ev) apply({ ev: e }); },
        }, evShort(e).replace(' ev.', ''))))));
    }
    const opts = areaOptions(AREAS, areasFor(cur.groupId));
    const anyData = opts.some((o) => o.has);
    parts.push(section('Área', 'ctx-h-area', h('div', { class: 'ctx-areas', role: 'group', 'aria-label': 'Área' },
      opts.map((o, i) => [
        anyData && !o.has && (i === 0 || opts[i - 1].has) ? h('p', { class: 'ctx-sub' }, `Otras áreas (${dataLabel})`) : null,
        option('area', o.area, o.area === cur.area, [
          h('span', { class: `ctx-dot ${areaColor(o.area)}`, 'aria-hidden': 'true' }),
          h('span', { class: 'ctx-area-name' }, o.area)], { className: 'ctx-area-opt' }),
      ]).flat().filter(Boolean))));
    parts.push(h('div', { class: 'ctx-foot' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => close() }, 'Listo')));
    body.replaceChildren(...parts);
    // Tras un toque, el foco sigue en la opción elegida (el contenido se ha repintado)
    if (focusKey) {
      const v = focusKey === 'groupId' ? cur.groupId : cur[focusKey];
      body.querySelector(`[data-k="${focusKey}"][data-v="${CSS.escape(String(v))}"]`)?.focus({ preventScroll: true });
    }
  }

  paint();
  const close = openSheet('Grupo, área y evaluación', body, {
    className: 'ctx-sheet-wrap',
    // La vista se ha repintado: el botón original ya no existe, así que el foco vuelve a la barra nueva
    onClose: () => {
      const back = opener && opener.isConnected ? opener : document.querySelector('.ctx-bar');
      if (back && back.focus) back.focus({ preventScroll: true });
    },
  });
  requestAnimationFrame(() => body.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true }));
  return close;
}
