// Tabula · piezas comunes de interfaz (rediseño, fase 1).
//
//   import { pageHead, openMenu, openActionSheet } from '../ui-kit.js';
//
//   pageHead({ eyebrow, title, primary, menu, back, meta, aside, className })  → <header class="page-head ph">
//     Cabecera única: línea superior + título a la izquierda; a la derecha, como mucho,
//     la acción principal y «⋯».
//     · eyebrow  texto o nodos de la línea superior (opcional)
//     · title    texto del <h1> (o un nodo ya hecho)
//     · primary  { label, short?, icon?, run? | href?, ariaLabel?, id?, className? } o un nodo
//                (short = texto corto para el móvil; el lector de pantalla oye siempre label)
//     · menu     [{ icon, label, desc?, run? | href?, external?, danger?, disabled? } | '-'] o una función
//                que los devuelve al abrir (para textos que cambian)
//     · back     { href, label } enlace «‹ Volver» encima del título
//     · meta     nodos bajo el título (etiquetas, descripción…)
//     · aside    nodo pequeño a la derecha antes de la acción principal (estado «Guardado», buscar…)
//
//   openMenu(anchor, items, { label })  → close()
//     Menú desplegable accesible (role=menu): foco al primer elemento, flechas, Inicio/Fin,
//     Escape (devuelve el foco al botón), Tab y toque fuera cierran.
//
//   openActionSheet(title, [{ icon, label, desc, run }], { intro })  → close()
//     Hoja inferior (sobre openSheet) con una lista de acciones con icono y una línea de explicación.
//
// Sin efectos al importar: las funciones puras (menuPosition, helpPlacement) se prueban con Node.
import { h, icon, openSheet } from './ui.js';

// ---------- Lógica pura ----------

/**
 * Dónde colocar un menú de tamaño `size` junto al botón `rect` sin salirse de la ventana `view`.
 * Por defecto debajo y alineado a la derecha del botón; si no cabe debajo, encima; si tampoco, pegado al borde.
 */
export function menuPosition(rect, size, view, gap = 6, margin = 8) {
  const left = Math.max(margin, Math.min(rect.right - size.width, view.width - size.width - margin));
  let top = rect.bottom + gap;
  if (top + size.height > view.height - margin) {
    const above = rect.top - gap - size.height;
    top = above >= margin ? above : Math.max(margin, view.height - margin - size.height);
  }
  return { left: Math.round(left), top: Math.round(top) };
}

/** Dónde va el enlace «¿Cómo funciona?»: en «⋯» si la cabecera ya tiene acciones; si no, como enlace. */
export function helpPlacement({ hasMenu = false, actions = 0 } = {}) {
  return hasMenu || actions > 0 ? 'menu' : 'link';
}

/** Une los elementos del menú propio y los añadidos (p. ej. la guía), con un separador entre ambos. */
export function joinMenuItems(base = [], extra = []) {
  const clean = (list) => list.filter(Boolean).filter((it, i, a) => it !== '-' || (i > 0 && i < a.length - 1 && a[i - 1] !== '-'));
  const b = clean(base), e = clean(extra);
  return b.length && e.length ? [...b, '-', ...e] : [...b, ...e];
}

// ---------- Cabecera ----------
const HEAD_MENUS = new WeakMap(); // header → { items, extra, btn, auto }

function primaryNode(p) {
  if (p instanceof Node) return p;
  const content = [p.icon === null ? null : icon(p.icon || 'plus', 17),
    p.short ? [h('span', { class: 'ph-long' }, p.label), h('span', { class: 'ph-short', 'aria-hidden': 'true' }, p.short)] : h('span', {}, p.label)];
  const attrs = {
    class: `btn btn-primary ph-primary${p.className ? ' ' + p.className : ''}`,
    id: p.id || null,
    'aria-label': p.ariaLabel || (p.short ? p.label : null),
    title: p.title || null,
  };
  return p.href
    ? h('a', { ...attrs, href: p.href }, content)
    : h('button', { ...attrs, type: 'button', onclick: p.run }, content);
}

function attachMenu(head, items, label = 'Más opciones', auto = false) {
  const btn = h('button', {
    type: 'button', class: 'icon-btn ph-menu', 'aria-label': label, title: label, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: () => {
      const m = HEAD_MENUS.get(head);
      const base = typeof m.items === 'function' ? m.items() : m.items;
      openMenu(btn, joinMenuItems(base || [], m.extra), { label });
    },
  }, icon('mas', 22));
  HEAD_MENUS.set(head, { items, extra: [], btn, auto });
  head.querySelector('.ph-actions').append(btn);
  return btn;
}

export function pageHead({ eyebrow = null, title = '', primary = null, menu = null, menuLabel = 'Más opciones', back = null, meta = null, aside = null, className = '', titleClass = '' } = {}) {
  const hasEyebrow = eyebrow !== null && eyebrow !== undefined && eyebrow !== '' && !(Array.isArray(eyebrow) && !eyebrow.length);
  const text = h('div', { class: 'ph-text' },
    back ? h('a', { class: 'link-btn ph-back', href: back.href }, icon('chevronLeft', 15), back.label) : null,
    hasEyebrow ? h('div', { class: 'eyebrow' }, typeof eyebrow === 'string' ? eyebrow.replace(/(\d)-(\d)/g, '$1\u2011$2') : eyebrow) : null,
    title instanceof Node ? title : h('h1', { class: `page-title${titleClass ? ' ' + titleClass : ''}` }, title),
    meta);
  const actions = h('div', { class: 'ph-actions' }, aside, primary ? primaryNode(primary) : null);
  const head = h('header', { class: `page-head ph${className ? ' ' + className : ''}` }, text, actions);
  if (menu) attachMenu(head, menu, menuLabel);
  return head;
}

/** ¿La cabecera tiene menú «⋯»? */
export const headHasMenu = (head) => HEAD_MENUS.has(head);

/** Añade elementos al menú «⋯» de una cabecera (lo crea si no lo tiene). */
export function addHeadMenuItems(head, items) {
  if (!head || !head.querySelector('.ph-actions')) return false;
  if (!HEAD_MENUS.has(head)) attachMenu(head, [], 'Más opciones', true);
  HEAD_MENUS.get(head).extra.push(...items);
  return true;
}

/** Quita los elementos añadidos que cumplan `test`; si el «⋯» se creó solo para ellos y queda vacío, lo quita. */
export function removeHeadMenuItems(head, test) {
  const m = head && HEAD_MENUS.get(head);
  if (!m) return;
  m.extra = m.extra.filter((it) => !test(it));
  if (m.auto && !m.extra.length) { m.btn.remove(); HEAD_MENUS.delete(head); }
}

// ---------- Menú «⋯» ----------
let openState = null;
let seq = 0;

export function openMenu(anchor, items, { label = '' } = {}) {
  // Volver a tocar el mismo botón cierra el menú
  if (openState) {
    const same = openState.anchor === anchor;
    openState.close({ focus: same });
    if (same) return () => {};
  }
  const id = `menu-${++seq}`;
  const els = [];
  const menu = h('div', { class: 'menu', role: 'menu', id, 'aria-label': label || anchor.getAttribute('aria-label') || 'Opciones', tabindex: '-1' });
  for (const it of items) {
    if (!it) continue;
    if (it === '-' || it.separator) { menu.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
    const content = [h('span', { class: 'menu-ic' }, it.icon ? icon(it.icon, 18) : null),
      h('span', { class: 'menu-txt' }, h('span', { class: 'menu-label' }, it.label), it.desc ? h('span', { class: 'menu-desc' }, it.desc) : null)];
    const cls = `menu-item${it.danger ? ' is-danger' : ''}`;
    const el = it.href
      ? h('a', { class: cls, role: 'menuitem', tabindex: '-1', href: it.href, target: it.external ? '_blank' : null, rel: it.external ? 'noopener' : null,
        onclick: () => close({ focus: false }) }, content)
      : h('button', { type: 'button', class: cls, role: 'menuitem', tabindex: '-1', disabled: !!it.disabled,
        onclick: () => { close({ focus: true }); if (it.run) it.run(); } }, content);
    els.push(el); menu.append(el);
  }
  const enabled = () => els.filter((e) => !e.disabled);
  const move = (d) => {
    const list = enabled(); if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    list[(i + d + list.length) % list.length].focus();
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); enabled()[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); enabled().at(-1)?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close({ focus: true }); }
    else if (e.key === 'Tab') { e.preventDefault(); close({ focus: true }); }
  };
  const onDown = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close({ focus: false }); };
  const onAway = (e) => { if (!(e && e.target instanceof Node && menu.contains(e.target))) close({ focus: false }); };

  function place() {
    const view = { width: document.documentElement.clientWidth, height: window.innerHeight };
    menu.style.maxHeight = `${view.height - 16}px`;
    const pos = menuPosition(anchor.getBoundingClientRect(), { width: menu.offsetWidth, height: menu.offsetHeight }, view);
    menu.style.left = `${pos.left}px`; menu.style.top = `${pos.top}px`;
  }
  let closed = false;
  function close({ focus = true } = {}) {
    if (closed) return; closed = true;
    menu.remove();
    anchor.setAttribute('aria-expanded', 'false');
    anchor.removeAttribute('aria-controls');
    menu.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('resize', onAway);
    window.removeEventListener('hashchange', onAway);
    window.removeEventListener('scroll', onAway, true);
    if (openState && openState.menu === menu) openState = null;
    if (focus && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  menu.addEventListener('keydown', onKey);
  document.body.append(menu);
  place();
  anchor.setAttribute('aria-expanded', 'true');
  anchor.setAttribute('aria-controls', id);
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('resize', onAway);
  window.addEventListener('hashchange', onAway);
  window.addEventListener('scroll', onAway, true);
  openState = { anchor, menu, close };
  (enabled()[0] || menu).focus({ preventScroll: true });
  return close;
}

// ---------- Hoja de acciones ----------
export function openActionSheet(title, actions, { intro = '', className = '' } = {}) {
  const opener = document.activeElement;
  let ran = false;
  const list = h('ul', { class: 'list action-list' },
    actions.filter(Boolean).map((a) => h('li', {},
      h('button', { type: 'button', class: 'action-item', onclick: () => { ran = true; close(); a.run && a.run(); } },
        h('span', { class: 'action-ic' }, icon(a.icon || 'plus', 20)),
        h('span', { class: 'action-txt' }, h('span', { class: 'action-label' }, a.label), a.desc ? h('span', { class: 'action-desc' }, a.desc) : null),
        icon('chevronRight', 18, 'action-go')))));
  const close = openSheet(title, [intro ? h('p', { class: 'action-intro' }, intro) : null, list].filter(Boolean),
    { className: `action-sheet${className ? ' ' + className : ''}`, onClose: () => { if (!ran && opener && opener.isConnected && opener.focus) opener.focus({ preventScroll: true }); } });
  requestAnimationFrame(() => list.querySelector('button')?.focus({ preventScroll: true }));
  return close;
}
