// Tabula · Ajustes · tarjeta «Acceso de asistente»
import { h, icon, toast, MESES } from '../../ui.js';
import { getSyncState, onSyncChange } from '../../sync.js';
import {
  getAssistantState, onAssistantChange, isActive, assistantLink, activate, renew, deactivate, regenerate,
  approveDevice, removeDevice, pendingInbox, NEED_CLOUD,
} from '../../asistente.js';
import { store } from '../../store.js';

const dayLabel = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
const stampLabel = (ms) => { const d = new Date(ms); return `${dayLabel(ms)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const CAN = [
  'Puede añadir tareas, eventos, observaciones y tutorías.',
  'Lee solo los nombres del alumnado, tus pendientes y las horas de tus eventos.',
  'No puede borrar ni cambiar nada, ni ver notas, medidas o datos de familias.',
  'Todo lo que envía pasa primero por tu bandeja: tú decides qué se guarda.',
];

/** Lleva a Ajustes y destaca la tarjeta (desde Hoy: «Un dispositivo quiere usar tu acceso»). */
export function goToAsistenteCard() {
  location.hash = '#/ajustes';
  let tries = 0;
  const t = setInterval(() => {
    const card = document.getElementById('ajustes-asistente');
    if (card || ++tries > 25) {
      clearInterval(t);
      if (!card) return;
      card.scrollIntoView({ block: 'start', behavior: 'smooth' });
      card.classList.add('is-flash');
      setTimeout(() => card.classList.remove('is-flash'), 1800);
    }
  }, 80);
}

export function asistenteCard() {
  let confirm = null;      // null | 'regenerar' | 'desactivar'
  let busy = false;
  let localError = '';
  const body = h('div', { class: 'as-card-body' });
  const chip = h('span', { class: 'chip t3', hidden: true });
  const el = h('section', { class: 'card', id: 'ajustes-asistente', 'aria-labelledby': 'aj-asistente-t' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title', id: 'aj-asistente-t' }, 'Acceso de asistente'), chip), body);

  async function run(fn, okMsg) {
    if (busy) return;
    busy = true; localError = ''; paint();
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { console.warn(e); localError = e?.message || 'No se pudo completar. Inténtalo de nuevo.'; }
    finally { busy = false; confirm = null; paint(); }
  }

  async function copy(link) {
    try { await navigator.clipboard.writeText(link); toast('Enlace copiado'); return; } catch {}
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, link);
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast('Enlace copiado'); } catch { toast('Selecciona el enlace y cópialo'); }
    ta.remove();
  }
  const share = (link) => navigator.share({ title: 'Acceso de asistente de Tabula', text: 'Enlace para añadir apuntes a la bandeja de Tabula', url: link }).catch(() => {});

  function paint() {
    const sync = getSyncState();
    const st = getAssistantState();
    const parts = [];
    chip.hidden = true;

    if (!sync.user) {
      parts.push(
        h('p', { class: 'settings-text' }, NEED_CLOUD),
        h('div', { class: 'settings-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => {
          const c = document.getElementById('ajustes-cuenta'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } }, 'Ir a Cuenta y sincronización')));
      body.replaceChildren(...parts.filter(Boolean));
      return;
    }

    if (!isActive()) {
      parts.push(
        h('p', { class: 'settings-text' }, 'Da a tu asistente (una persona o una IA) un permiso limitado y revocable para añadir apuntes a Tabula.'),
        h('ul', { class: 'as-can' }, CAN.map((t) => h('li', {}, icon('check', 16), h('span', {}, t)))),
        h('p', { class: 'as-rgpd' }, icon('lock', 16), h('span', {}, 'Los nombres y observaciones son datos personales del alumnado: si tu asistente es un servicio de IA, consulta antes al Delegado de Protección de Datos.')),
        localError ? h('p', { class: 'sync-error', role: 'alert' }, localError) : null,
        h('div', { class: 'settings-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', id: 'as-activar', disabled: busy, onclick: () => run(() => activate(), 'Acceso activado') }, busy ? 'Activando…' : 'Activar acceso')));
      body.replaceChildren(...parts.filter(Boolean));
      return;
    }

    // ---- Activo ----
    const link = assistantLink();
    const expira = st.expira || st.config?.expira || null;
    const expired = expira && expira < Date.now();
    const soon = expira && !expired && expira - Date.now() < 14 * 86400000;
    chip.hidden = false;
    chip.className = `chip ${st.activo === false || expired ? 't1' : 't3'}`;
    chip.textContent = expired ? 'Caducado' : st.activo === false ? 'Desactivado' : 'Activo';

    parts.push(
      h('div', { class: 'field as-link-field' },
        h('label', { for: 'as-enlace' }, 'Enlace para tu asistente'),
        h('input', { class: 'input as-link', id: 'as-enlace', readonly: true, value: link, onfocus: (e) => e.target.select() }),
        h('div', { class: 'settings-actions' },
          h('button', { type: 'button', class: 'btn', id: 'as-copiar', onclick: () => copy(link) }, icon('link', 16), 'Copiar enlace'),
          navigator.share ? h('button', { type: 'button', class: 'btn', id: 'as-compartir', onclick: () => share(link) }, icon('upload', 16), 'Compartir') : null),
        h('p', { class: 'as-hint-text' }, 'Quien tenga este enlace podrá pedir acceso, pero solo funcionará en los dispositivos que tú apruebes.')),

      h('div', { class: 'as-validity' },
        h('span', { class: expired || soon ? 'as-val-warn' : '', id: 'as-caduca' }, expira ? `${expired ? 'Caducó' : 'Caduca'} el ${dayLabel(expira)}` : 'Sin fecha de caducidad'),
        h('button', { type: 'button', class: 'btn btn-sm', id: 'as-renovar', disabled: busy, onclick: () => run(() => renew(), 'Renovado 90 días') }, icon('clock', 15), 'Renovar 90 días')));

    const inbox = pendingInbox().length;
    if (inbox) {
      parts.push(h('div', { class: 'as-inbox-row' },
        h('span', {}, h('strong', {}, plural(inbox, 'apunte', 'apuntes')), ' en la bandeja'),
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'as-abrir-bandeja', onclick: () => import('../bandeja.js').then((m) => m.openBandeja()) }, 'Abrir bandeja')));
    }

    // Dispositivos
    const devs = [...(st.dispositivos || [])].sort((a, b) => (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1) || (a.creado || 0) - (b.creado || 0));
    parts.push(h('div', { class: 'as-devices' },
      h('div', { class: 'section-label' }, 'Dispositivos'),
      devs.length
        ? h('ul', { class: 'as-dev-list', id: 'as-dispositivos' }, devs.map((d) => {
          const pending = d.estado === 'pendiente';
          return h('li', { class: `as-dev${pending ? ' is-pending' : ''}`, dataset: { id: d.id } },
            h('span', { class: 'as-dev-main' },
              h('span', { class: 'as-dev-name' }, d.nombre || 'Dispositivo'),
              h('span', { class: 'as-dev-sub' }, d.creado ? `Pidió acceso el ${stampLabel(d.creado)}` : '')),
            h('span', { class: `chip ${pending ? 't5' : 't3'}` }, pending ? 'Pendiente' : 'Aprobado'),
            h('span', { class: 'as-dev-actions' },
              pending ? h('button', { type: 'button', class: 'btn btn-sm btn-primary', 'aria-label': `Aprobar ${d.nombre || 'dispositivo'}`, disabled: busy, onclick: () => run(() => approveDevice(d.id), 'Dispositivo aprobado') }, 'Aprobar') : null,
              h('button', {
                type: 'button', class: 'btn btn-sm btn-ghost btn-danger', disabled: busy,
                'aria-label': `${pending ? 'Rechazar' : 'Retirar'} ${d.nombre || 'dispositivo'}`,
                onclick: () => run(() => removeDevice(d.id), pending ? 'Dispositivo rechazado' : 'Dispositivo retirado'),
              }, pending ? 'Rechazar' : 'Retirar')));
        }))
        : h('p', { class: 'as-hint-text' }, 'Todavía no hay ningún dispositivo. Cuando tu asistente abra el enlace y pida acceso, aparecerá aquí para que lo apruebes.')));

    // Acciones y confirmaciones
    const confirmBox = confirm && h('div', { class: 'confirm-box', role: 'alertdialog', 'aria-label': 'Confirmar' },
      h('p', {}, confirm === 'regenerar'
        ? 'Se creará un enlace nuevo. El enlace actual y todos los dispositivos aprobados dejarán de funcionar al momento.'
        : 'El acceso se cierra al momento: el enlace y los dispositivos dejarán de funcionar. Lo que ya esté en la bandeja se conserva.'),
      h('div', { class: 'settings-actions' },
        h('button', { type: 'button', class: 'btn btn-danger', id: 'as-confirmar', disabled: busy,
          onclick: () => (confirm === 'regenerar' ? run(() => regenerate(), 'Llave regenerada') : run(() => deactivate(), 'Acceso desactivado')) },
        confirm === 'regenerar' ? 'Regenerar llave' : 'Desactivar acceso'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { confirm = null; paint(); } }, 'Cancelar')));
    parts.push(
      st.activo === false && !expired ? h('p', { class: 'sync-error', role: 'alert' }, 'El acceso está desactivado. Regenera la llave o desactívalo del todo y vuelve a activarlo.') : null,
      st.error ? h('p', { class: 'sync-error', role: 'alert' }, st.error) : null,
      localError ? h('p', { class: 'sync-error', role: 'alert' }, localError) : null,
      h('div', { class: 'settings-actions as-danger-row' },
        h('button', { type: 'button', class: 'btn', id: 'as-regenerar', disabled: busy, onclick: () => { confirm = 'regenerar'; paint(); } }, 'Regenerar llave'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-danger', id: 'as-desactivar', disabled: busy, onclick: () => { confirm = 'desactivar'; paint(); } }, 'Desactivar')),
      confirmBox || null);
    body.replaceChildren(...parts.filter(Boolean));
  }

  paint();
  const u1 = onAssistantChange(paint);
  const u2 = onSyncChange(paint);
  const u3 = store.subscribe('bandejaAsistente', paint);
  const u4 = store.subscribe('settings', paint);
  return { el, destroy: () => { u1(); u2(); u3(); u4(); } };
}
