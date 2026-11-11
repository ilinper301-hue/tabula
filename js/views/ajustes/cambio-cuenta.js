// Tabula · aviso al entrar con otra cuenta cuando este dispositivo tiene cambios sin subir de la anterior.
// No se borra nada sin una decisión expresa: se ofrece copia, volver a la cuenta anterior o borrar y seguir.

import { h } from '../../ui.js';
import { resolverCambioCuenta, signIn } from '../../sync.js';
import { descargarCopia } from './copia.js';

/** @param info { anterior, nueva } correos de las dos cuentas */
export function cambioCuentaBox(info) {
  const estado = h('p', { class: 'settings-text', role: 'status', 'aria-live': 'polite', hidden: true });
  const btnCopia = h('button', { class: 'btn btn-primary', onclick: async () => {
    btnCopia.disabled = true; estado.hidden = false; estado.textContent = 'Preparando la copia…';
    try { const c = await descargarCopia((t) => { if (t) estado.textContent = t; }); estado.textContent = `${c.mensaje}. Guárdala antes de continuar.`; }
    catch (e) { console.warn(e); estado.textContent = 'No se pudo crear la copia.'; }
    btnCopia.disabled = false;
  } }, 'Descargar copia');
  let confirmar = false;
  const forzar = h('div', { class: 'settings-actions riesgo-forzar' });
  const pintarForzar = () => forzar.replaceChildren(confirmar
    ? h('p', { class: 'settings-text', role: 'alert' }, `Se borrarán de este dispositivo los datos de ${info.anterior || 'la otra cuenta'}, incluidos los cambios sin subir. ¿Seguro?`)
    : null,
    h('button', { class: 'btn btn-sm btn-ghost btn-danger', onclick: async (e) => {
      if (!confirmar) { confirmar = true; pintarForzar(); return; }
      e.currentTarget.disabled = true;
      await resolverCambioCuenta(true);
    } }, confirmar ? 'Sí, borrar y entrar' : `Borrar y entrar con ${info.nueva || 'la nueva cuenta'}`));
  pintarForzar();
  return h('div', { class: 'confirm-box' },
    h('p', { role: 'alert' }, h('strong', {}, 'No he entrado ni he borrado nada.'),
      ` Este dispositivo tiene cambios que aún no se han subido a ${info.anterior || 'la cuenta que usabas antes'}. Si entras con ${info.nueva || 'otra cuenta'}, se borrarían.`),
    h('p', {}, `Lo más seguro: vuelve a entrar con ${info.anterior || 'la cuenta anterior'} con conexión para que se suban, y después cambia de cuenta. Si necesitas cambiar ya, descarga antes una copia.`),
    estado,
    h('div', { class: 'settings-actions' },
      btnCopia,
      h('button', { class: 'btn', onclick: async () => { await resolverCambioCuenta(false); signIn().catch(() => {}); } }, 'Entrar con la cuenta anterior'),
      h('button', { class: 'btn btn-ghost', onclick: () => resolverCambioCuenta(false) }, 'Cancelar')),
    forzar);
}
