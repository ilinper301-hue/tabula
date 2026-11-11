// Tabula · Ajustes · tarjeta «Estado de tus datos»: de un vistazo, si los datos están a salvo.
// La lógica (qué se muestra y con qué tono) está en datos-model.js (filasEstado).

import { store } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { getSyncState, onSyncChange, pendingStatus, SYNC_LABELS } from '../../sync.js';
import { filasEstado } from '../../datos-model.js';
import { descargarCopia } from './copia.js';

export function estadoDatosCard() {
  const lista = h('dl', { class: 'datos-list' });
  const estado = h('p', { class: 'settings-text datos-estado', role: 'status', 'aria-live': 'polite', hidden: true });
  let info = { diasCopia: null, persistente: null, uso: null, cuota: null, pendientes: null };
  let vivo = true, turno = 0, timer = null;

  const pedir = h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => {
    pedir.disabled = true;
    let ok = false;
    try { ok = await navigator.storage.persist(); } catch {}
    pedir.disabled = false;
    toast(ok ? 'Almacenamiento protegido' : 'El navegador no lo ha concedido. Instala Tabula en la pantalla de inicio y vuelve a probar.');
    refrescar();
  } }, 'Pedir protección');

  function pintar() {
    const sync = getSyncState();
    const filas = filasEstado({ ...info, sync, etiquetaSync: SYNC_LABELS[sync.status], almacen: store.almacen });
    lista.replaceChildren(...filas.map((f) => h('div', { class: 'datos-row' },
      h('dt', {}, f.etiqueta),
      h('dd', {},
        h('span', { class: `datos-valor${f.tono ? ` is-${f.tono}` : ''}` }, h('span', { class: 'datos-dot', 'aria-hidden': 'true' }), f.valor),
        ...(f.detalle ? [h('span', { class: 'datos-detalle' }, f.detalle)] : []),
        ...(f.clave === 'persistente' && info.persistente === false && navigator.storage && navigator.storage.persist ? [pedir] : [])))));
  }

  async function refrescar() {
    const mio = ++turno;
    const { daysSinceBackup } = await import('../../backup.js');
    const nuevo = { diasCopia: daysSinceBackup(), persistente: null, uso: null, cuota: null };
    try { if (navigator.storage && navigator.storage.persisted) nuevo.persistente = await navigator.storage.persisted(); } catch {}
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); nuevo.uso = e.usage ?? null; nuevo.cuota = e.quota ?? null; } } catch {}
    if (!vivo || mio !== turno) return;
    info = { ...info, ...nuevo };
    pintar();
    // Lo pendiente de subir tarda (espera a Firestore con tiempo límite): se pinta aparte
    if (getSyncState().user) {
      let p = null;
      try { p = await pendingStatus(2500); } catch {}
      if (!vivo || mio !== turno) return;
      info = { ...info, pendientes: p };
      pintar();
    }
  }
  const pronto = () => { clearTimeout(timer); timer = setTimeout(refrescar, 400); };

  const btnCopia = h('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
    btnCopia.disabled = true; estado.hidden = false; estado.textContent = 'Preparando la copia…';
    try { const c = await descargarCopia((t) => { if (t) estado.textContent = t; }); toast(c.mensaje); estado.hidden = true; }
    catch (e) { console.warn(e); estado.textContent = 'No se pudo crear la copia.'; }
    btnCopia.disabled = false;
    refrescar();
  } }, icon('download', 18), 'Hacer copia ahora');

  const el = h('section', { class: 'card', id: 'ajustes-datos' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Estado de tus datos')),
    lista, estado,
    h('div', { class: 'settings-actions' }, btnCopia));

  pintar();
  refrescar();
  const offs = [onSyncChange(() => { pintar(); pronto(); }), store.onAlmacen(pintar), store.subscribe('settings', pronto)];
  import('../../files.js').then((f) => { if (vivo) offs.push(f.onPendingChange(pronto)); }).catch(() => {});

  return { el, destroy() { vivo = false; clearTimeout(timer); offs.forEach((o) => { try { o(); } catch {} }); } };
}
