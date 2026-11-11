// Tabula · cerrar sesión con seguridad: no se borra nada del dispositivo sin comprobar antes
// que todo está en la nube. Si no se puede asegurar, se avisa y se ofrece una copia.
// Se usa en Ajustes y en la pantalla de bloqueo («He olvidado el PIN»).

import { h } from '../../ui.js';
import { signOutAndClear } from '../../sync.js';
import { descargarCopia } from './copia.js';

/**
 * Caja de confirmación para cerrar sesión.
 * @param o.texto          explicación inicial
 * @param o.copia          ofrecer «Descargar copia» si hay riesgo (false en la pantalla de bloqueo: la copia saltaría el PIN)
 * @param o.onCancel       al pulsar Cancelar (si no se pasa, no hay botón Cancelar en el primer paso)
 * @param o.antesDeBorrar  se ejecuta justo antes de borrar de verdad
 * @returns { el, reset() }
 */
export function cerrarSesionBox({ texto, copia = true, onCancel = null, antesDeBorrar = null } = {}) {
  const el = h('div', { class: 'confirm-box' });
  const cancelar = () => { reset(); if (onCancel) onCancel(); };

  function reset() {
    el.replaceChildren(
      h('p', {}, texto || 'Al cerrar sesión se borrarán los datos de este dispositivo. Antes comprobaré que todo esté guardado en tu cuenta.'),
      h('div', { class: 'settings-actions' },
        h('button', { class: 'btn btn-danger', onclick: () => intentar(false) }, 'Cerrar sesión y borrar'),
        ...(onCancel ? [h('button', { class: 'btn btn-ghost', onclick: cancelar }, 'Cancelar')] : [])));
  }

  async function intentar(forzar) {
    el.replaceChildren(h('p', { role: 'status', style: { marginBottom: '0' } }, forzar ? 'Cerrando sesión…' : 'Comprobando que todo está subido a tu cuenta…'));
    let r;
    try { r = await signOutAndClear({ forzar, antesDeBorrar }); }
    catch (e) { console.warn(e); r = { hecho: false, motivos: ['No se pudo cerrar la sesión. Inténtalo de nuevo.'] }; }
    if (r && r.hecho) return; // la página se recarga
    aviso((r && r.motivos) || []);
  }

  function aviso(motivos) {
    const estado = h('p', { class: 'settings-text', role: 'status', 'aria-live': 'polite', hidden: true });
    const btnCopia = h('button', { class: 'btn btn-primary', onclick: async () => {
      btnCopia.disabled = true; estado.hidden = false; estado.textContent = 'Preparando la copia…';
      try { const c = await descargarCopia((t) => { if (t) estado.textContent = t; }); estado.textContent = `${c.mensaje}. Guárdala antes de continuar.`; }
      catch (e) { console.warn(e); estado.textContent = 'No se pudo crear la copia.'; }
      btnCopia.disabled = false;
    } }, 'Descargar copia');
    el.replaceChildren(
      h('p', { role: 'alert' }, h('strong', {}, 'No he cerrado la sesión ni he borrado nada.'), ' Si borro ahora los datos de este dispositivo, podrías perder cambios:'),
      h('ul', { class: 'riesgo-list' }, ...motivos.map((m) => h('li', {}, m))),
      h('p', {}, copia
        ? 'Lo más seguro: recupera la conexión y pulsa «Volver a comprobar». Si necesitas salir ya, descarga antes una copia.'
        : 'Lo más seguro: recupera la conexión y pulsa «Volver a comprobar».'),
      estado,
      h('div', { class: 'settings-actions' },
        ...(copia ? [btnCopia] : []),
        h('button', { class: 'btn', onclick: () => intentar(false) }, 'Volver a comprobar'),
        h('button', { class: 'btn btn-ghost', onclick: cancelar }, 'Cancelar')),
      h('div', { class: 'settings-actions riesgo-forzar' },
        h('button', { class: 'btn btn-sm btn-ghost btn-danger', onclick: () => intentar(true) }, 'Borrar de todos modos')));
    const a = el.querySelector('[role=alert]'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
  }

  reset();
  return { el, reset };
}
