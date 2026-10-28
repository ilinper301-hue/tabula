// Tabula · Ajustes · barra inferior del móvil (4 atajos + «Más»)
import { store } from '../../store.js';
import { h, icon, openSheet, toast } from '../../ui.js';
import { SECTIONS, NAV_BLOCKS, DEFAULT_MOBILE, MOBILE_SLOTS, normalizeMobileNav } from '../../nav-model.js';

export const getMobileNav = () => normalizeMobileNav(store.getSetting('navMovil', null));

/** Hoja para elegir y ordenar los 4 atajos de la barra inferior. */
export function openBarSheet({ onSaved } = {}) {
  let sel = getMobileNav();
  const body = h('div', { class: 'bar-edit' });
  let close = () => {};

  const move = (i, d) => { const j = i + d; if (j < 0 || j >= sel.length) return; [sel[i], sel[j]] = [sel[j], sel[i]]; };

  function paint(focusKey) {
    const full = sel.length >= MOBILE_SLOTS;
    const chosen = h('ol', { class: 'bar-chosen', 'aria-label': 'Atajos de la barra' },
      ...Array.from({ length: MOBILE_SLOTS }, (_, i) => {
        const id = sel[i];
        if (!id) return h('li', { class: 'bar-slot is-empty' }, h('span', { class: 'bar-num' }, String(i + 1)), h('span', { class: 'bar-empty' }, 'Elige una sección de abajo'));
        const r = SECTIONS[id];
        return h('li', { class: 'bar-slot' },
          h('span', { class: 'bar-num' }, String(i + 1)),
          h('span', { class: 'bar-ico' }, icon(r.icon, 18)),
          h('span', { class: 'bar-name' }, r.label),
          h('button', { type: 'button', class: 'icon-btn bar-btn', 'data-k': `up-${id}`, 'aria-label': `Subir ${r.label}`, disabled: i === 0, onclick: () => { move(i, -1); paint(`up-${id}`); } },
            icon('chevronDown', 18, 'bar-up')),
          h('button', { type: 'button', class: 'icon-btn bar-btn', 'data-k': `down-${id}`, 'aria-label': `Bajar ${r.label}`, disabled: i === sel.length - 1, onclick: () => { move(i, 1); paint(`down-${id}`); } },
            icon('chevronDown', 18)),
          h('button', { type: 'button', class: 'icon-btn bar-btn', 'data-k': `rm-${id}`, 'aria-label': `Quitar ${r.label}`, onclick: () => { sel = sel.filter((x) => x !== id); paint('first-free'); } },
            icon('x', 18)));
      }));

    const avail = NAV_BLOCKS.map((b) => ({ b, ids: b.items.filter((id) => !sel.includes(id)) })).filter((x) => x.ids.length);
    const pool = h('div', { class: 'bar-pool' },
      ...avail.map(({ b, ids }) => h('div', { class: 'bar-pool-block' },
        h('div', { class: 'section-label' }, b.label),
        h('div', { class: 'bar-pool-items' }, ...ids.map((id) => {
          const r = SECTIONS[id];
          return h('button', { type: 'button', class: 'bar-add', 'data-k': `add-${id}`, disabled: full, onclick: () => { sel = [...sel, id]; paint(`add-${id}`); } },
            icon(r.icon, 18), h('span', {}, r.label), icon('plus', 15, 'bar-plus'));
        })))));

    const preview = h('div', { class: 'bar-preview', role: 'img', 'aria-label': `Vista previa: ${sel.map((id) => SECTIONS[id].label).join(', ')} y Más` },
      ...Array.from({ length: MOBILE_SLOTS }, (_, i) => {
        const r = SECTIONS[sel[i]];
        return h('span', { class: `bar-pv${r ? '' : ' is-empty'}`, 'aria-hidden': 'true' }, r ? icon(r.icon, 20) : h('span', { class: 'bar-pv-dot' }), r ? r.label : '');
      }),
      h('span', { class: 'bar-pv', 'aria-hidden': 'true' }, icon('mas', 20), 'Más'));

    const missing = MOBILE_SLOTS - sel.length;
    const same = sel.join() === getMobileNav().join();
    body.replaceChildren(
      preview,
      h('p', { class: 'bar-hint', role: 'status' }, missing ? `Elige ${missing === 1 ? 'una sección más' : `${missing} secciones más`}.` : 'Toca una sección para quitarla o usa las flechas para ordenarla.'),
      chosen,
      avail.length ? h('h3', { class: 'section-label bar-pool-title' }, 'Secciones disponibles') : '',
      pool,
      h('div', { class: 'bar-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { sel = [...DEFAULT_MOBILE]; paint(); } }, 'Restablecer'),
        h('button', { type: 'button', class: 'btn btn-primary', disabled: missing > 0 || same, onclick: save }, 'Guardar')));

    if (focusKey) {
      const target = focusKey === 'first-free'
        ? body.querySelector('.bar-add:not(:disabled)')
        : body.querySelector(`[data-k="${focusKey}"]:not(:disabled)`) || body.querySelector('.bar-btn:not(:disabled)');
      if (target) target.focus();
    }
  }

  function save() {
    if (sel.length !== MOBILE_SLOTS) return;
    store.setSetting('navMovil', [...sel]);
    toast('Barra inferior guardada');
    close();
    if (onSaved) onSaved(sel);
  }

  paint();
  close = openSheet('Barra inferior', body, { className: 'bar-sheet' });
  return close;
}

/** Tarjeta de Ajustes: personalizar la barra inferior del móvil. */
export function menuCard() {
  const names = () => getMobileNav().map((id) => SECTIONS[id].label).join(' · ');
  const current = h('p', { class: 'settings-text', id: 'ajustes-barra-actual' });
  const paint = () => { current.textContent = `En el móvil ahora: ${names()} y Más.`; };
  paint();
  const unsub = store.subscribe('settings', paint);
  const card = h('section', { class: 'card', id: 'ajustes-barra' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Barra inferior del móvil')),
    h('p', { class: 'settings-text' }, 'Elige los cuatro accesos que quieres siempre a mano; el resto está en «Más».'),
    current,
    h('div', { class: 'settings-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => openBarSheet() }, icon('sidebar', 18), 'Personalizar barra inferior')));
  // La tarjeta se vuelve a crear en cada visita a Ajustes; basta con dejar de escuchar si ya no está en el documento.
  const stop = store.subscribe('settings', () => { if (!card.isConnected) { unsub(); stop(); } });
  return card;
}
