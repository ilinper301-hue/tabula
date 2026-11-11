// Tabula · avisos cuando el dispositivo no deja leer o guardar los datos (IndexedDB)
//
// - mostrarBloqueo(): pantalla completa. IndexedDB existe pero no se abrió y aquí había datos:
//   la app no arranca para no parecer vacía ni escribir encima. Solo cabe «Reintentar».
// - montarAvisoAlmacen(): franja sobre el contenido cuando se trabaja en modo reducido (localStorage)
//   o cuando un guardado ha fallado (los cambios siguen en memoria hasta que se consiga guardar).

import { store } from '../store.js';
import { h } from '../ui.js';

export function mostrarBloqueo() {
  if (document.getElementById('almacen-bloqueo')) return;
  const estado = h('p', { class: 'almacen-estado', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
    btn.disabled = true; estado.textContent = 'Reintentando…';
    let a;
    try { a = await store.reintentar(); } catch { a = store.almacen; }
    if (!a.bloqueado) { estado.textContent = 'Ya puedo leerlos. Abriendo…'; location.reload(); return; }
    btn.disabled = false;
    estado.textContent = `Sigue sin funcionar. Prueba los pasos de arriba y reintenta.${a.error ? ` (Detalle: ${a.error})` : ''}`;
  } }, 'Reintentar');
  const el = h('div', { id: 'almacen-bloqueo', class: 'almacen-bloqueo', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'almacen-t', 'aria-describedby': 'almacen-d' },
    h('div', { class: 'almacen-card' },
      h('h1', { id: 'almacen-t', class: 'almacen-title' }, 'No puedo leer tus datos'),
      h('p', { id: 'almacen-d' }, h('strong', {}, 'No añadas nada y reintenta.'), ' Tus datos siguen guardados en este dispositivo, pero ahora mismo el navegador no me deja abrirlos. Por eso no te muestro la app vacía.'),
      h('ul', { class: 'almacen-pasos' },
        h('li', {}, 'Cierra otras pestañas o ventanas de Tabula.'),
        h('li', {}, 'Cierra del todo el navegador (o la app) y vuelve a abrir.'),
        h('li', {}, 'Si el móvil está casi lleno, libera algo de espacio.')),
      h('p', { class: 'almacen-nota' }, 'No borres los datos del navegador ni desinstales la app: perderías lo que no esté en tu cuenta o en una copia.'),
      btn, estado));
  document.body.append(el);
  btn.focus();
}

export function montarAvisoAlmacen() {
  const main = document.getElementById('main');
  if (!main) return;
  const bar = h('div', { class: 'almacen-bar', role: 'alert', hidden: true });
  main.prepend(bar);
  const paint = (a) => {
    if (!a.guardadoFallido && !a.aviso) { bar.hidden = true; bar.replaceChildren(); return; }
    const estado = h('span', { class: 'almacen-bar-estado', role: 'status' });
    const btn = h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => {
      btn.disabled = true; estado.textContent = 'Reintentando…';
      let r;
      try { r = await store.reintentar(); } catch { r = store.almacen; }
      if (r.modo === 'idb' && !r.guardadoFallido) { if (a.aviso) location.reload(); return; }
      if (r.bloqueado) { location.reload(); return; }
      btn.disabled = false; estado.textContent = 'Sigue sin funcionar.';
    } }, 'Reintentar');
    bar.replaceChildren(
      h('p', {}, a.guardadoFallido
        ? h('span', {}, h('strong', {}, 'No puedo guardar tus cambios en este dispositivo.'), ' No cierres Tabula: reintenta y, si sigue igual, descarga una copia en Ajustes.')
        : h('span', {}, h('strong', {}, 'No puedo abrir el almacén de datos del navegador.'), ' Tabula funciona en modo reducido (poco espacio). Reintenta o reinicia el navegador.')),
      h('div', { class: 'almacen-bar-actions' }, btn, estado));
    bar.hidden = false;
  };
  paint(store.almacen);
  store.onAlmacen(paint);
}
