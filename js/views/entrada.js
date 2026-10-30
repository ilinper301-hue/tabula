// Tabula · pantalla de entrada: lo primero que se ve si no hay sesión iniciada en este dispositivo.
// Iniciar sesión con Google (recomendado) o seguir sin cuenta (se recuerda en este dispositivo).

import { store } from '../store.js';
import { h, icon, logoLockup, googleButton } from '../ui.js';
import { getSyncState, onSyncChange, signIn } from '../sync.js';

const SIN_CUENTA = 'tabula.sinCuenta';
const sinCuenta = () => { try { return localStorage.getItem(SIN_CUENTA) === '1'; } catch { return false; } };

/** ¿Hay que mostrar la entrada? (ni sesión enlazada, ni «sin cuenta» elegido en este dispositivo) */
export const needsEntrada = () => getSyncState().enabled && !store.getSetting('syncUid') && !sinCuenta();

/** Muestra la entrada encima de la app. Al entrar, sigue el primer uso (bienvenida) si hace falta. */
export function showEntrada() {
  let error = '', busy = false;
  const errBox = h('p', { class: 'en-error', role: 'alert' });
  const btnSlot = h('div', { class: 'en-google' });
  const el = h('div', { class: 'entrada', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'en-title' },
    h('div', { class: 'en-card' },
      logoLockup({ size: 44 }),
      h('h1', { class: 'en-title', id: 'en-title' }, 'Inicia sesión para empezar'),
      h('p', { class: 'en-lead' }, 'Tus datos se guardan en tu cuenta y los tienes en el móvil, la tableta y el ordenador.'),
      btnSlot, errBox,
      h('ul', { class: 'en-perks' },
        [['lock', 'Solo tú ves tus datos: nadie más tiene acceso.'], ['download', 'Si cambias de dispositivo, lo recuperas todo al entrar.']]
          .map(([ic, t]) => h('li', {}, icon(ic, 16), h('span', {}, t)))),
      h('button', { type: 'button', class: 'btn btn-ghost en-skip', id: 'en-sin-cuenta', onclick: () => {
        try { localStorage.setItem(SIN_CUENTA, '1'); } catch {}
        close();
        firstUse();
      } }, 'Usar sin cuenta en este dispositivo'),
      h('p', { class: 'en-note' }, 'Sin cuenta, los datos solo quedan en este dispositivo. Puedes iniciar sesión cuando quieras en Ajustes.')));

  function paint() {
    const st = getSyncState();
    const loading = st.status === 'loading' || busy;
    btnSlot.replaceChildren(googleButton(async () => {
      busy = true; error = ''; paint();
      try { await signIn(); } catch { error = getSyncState().error || 'No se pudo iniciar sesión. Inténtalo de nuevo.'; }
      busy = false; paint();
    }, { disabled: loading, label: loading && busy ? 'Conectando…' : 'Iniciar sesión con Google' }));
    errBox.textContent = error || (st.status === 'error' ? st.error || '' : '');
    errBox.hidden = !errBox.textContent;
    if (st.user) { close(); afterSignIn(); }
  }

  let off = null;
  function close() { if (off) { off(); off = null; } el.remove(); document.body.classList.remove('has-entrada'); }

  document.body.append(el);
  document.body.classList.add('has-entrada');
  off = onSyncChange(paint);
  paint();
}

/** Primer uso sin cuenta: el asistente de bienvenida si aún no hay nada. */
async function firstUse() {
  const { needsOnboarding } = await import('./bienvenida.js');
  if (needsOnboarding()) location.hash = '#/bienvenida';
}

/** Tras iniciar sesión: si la cuenta es nueva (no llega nada de la nube), se ofrece la bienvenida. */
function afterSignIn() {
  const check = async () => {
    const st = getSyncState();
    if (st.status !== 'synced' && st.status !== 'offline') return false;
    const { needsOnboarding } = await import('./bienvenida.js');
    if (needsOnboarding()) location.hash = '#/bienvenida';
    return true;
  };
  const off = onSyncChange(async () => { if (await check()) off(); });
  setTimeout(() => off(), 20000);
}
