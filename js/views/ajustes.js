// Tabula · Ajustes: perfil, apariencia y copia de seguridad

import { store } from '../store.js';
import { h, icon, toast, googleButton } from '../ui.js';
import { applyTheme, applyAccent, ACCENTS } from '../app.js';
import { getSyncState, onSyncChange, signIn, signOutAndClear, SYNC_LABELS } from '../sync.js';
import {
  isLockEnabled, setPin, verifyPin, disableLock, isValidPin, lockTimeout, setLockTimeout, TIMEOUTS,
  biometricAvailable, enableBiometric, disableBiometric, hasBiometric, lockNow, onLockConfigChange,
} from '../lock.js';
import { calendarioEscolarCard } from './ajustes/calendario-escolar.js';
import { nuevoCursoCard } from './ajustes/nuevo-curso.js';
import { guiaCard } from './ajustes/guia.js';
import { menuCard } from './ajustes/menu.js';

export function render(container) {
  const profile = store.getSetting('profile', { nombre: '', centro: '' });

  // --- Perfil ---
  const nombre = h('input', { class: 'input', id: 'aj-nombre', value: profile.nombre || '', placeholder: 'Tu nombre', autocomplete: 'name' });
  const centro = h('input', { class: 'input', id: 'aj-centro', value: profile.centro || '', placeholder: 'Ej. 1º A · CEIP …' });
  const saveProfile = () => {
    store.setSetting('profile', { nombre: nombre.value.trim(), centro: centro.value.trim() });
    toast('Perfil guardado');
  };
  [nombre, centro].forEach((el) => el.addEventListener('change', saveProfile));

  // --- Tema ---
  const current = store.getSetting('theme', 'system');
  const themeBtns = [['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([val, label]) =>
    h('button', {
      role: 'tab', 'aria-selected': String(val === current),
      onclick: (e) => {
        store.setSetting('theme', val); applyTheme();
        e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
      },
    }, label));

  // --- Color de la app ---
  const curAccent = store.getSetting('accent', 'azul');
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color de la app' },
    ...ACCENTS.map(([key, label, hex]) => h('button', {
      type: 'button', class: 'swatch', role: 'radio', 'aria-checked': String(key === curAccent),
      onclick: (e) => {
        store.setSetting('accent', key); applyAccent();
        swatches.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
      },
    }, h('span', { class: 'swatch-dot', style: { background: hex } }, icon('check', 16)), label)));

  // --- Evaluación: valores por defecto para cuadernos nuevos ---
  const evDef = store.getSetting('evaluacionDefaults', { escala: 'numerica', modo: 'porcentajes', final: 'continua' });
  const evSeg = (key, label, options) => h('div', { class: 'field' },
    h('span', { class: 'field-label', id: `aj-ev-${key}` }, label),
    h('div', { class: 'segmented', role: 'tablist', 'aria-labelledby': `aj-ev-${key}` },
      ...options.map(([val, text]) => h('button', {
        role: 'tab', 'aria-selected': String(evDef[key] === val),
        onclick: (e) => {
          evDef[key] = val;
          store.setSetting('evaluacionDefaults', { ...evDef });
          e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
          toast('Preferencia guardada');
        },
      }, text))));

  // --- Copia de seguridad (datos + archivos en .zip) ---
  const backupStatus = h('p', { class: 'settings-text', role: 'status', 'aria-live': 'polite' });
  const paintBackupStatus = (txt) => {
    if (txt) { backupStatus.textContent = txt; return; }
    import('../backup.js').then(({ daysSinceBackup }) => {
      const d = daysSinceBackup();
      backupStatus.textContent = d === null ? 'Todavía no has descargado ninguna copia.' : d === 0 ? 'Última copia: hoy.' : `Última copia: hace ${d} ${d === 1 ? 'día' : 'días'}.`;
    });
  };
  paintBackupStatus();
  const exportData = async () => {
    try {
      const { createBackup } = await import('../backup.js');
      const { blob, nombre, archivos, faltan } = await createBackup((t) => paintBackupStatus(t));
      const a = h('a', { href: URL.createObjectURL(blob), download: nombre });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(faltan ? `Copia descargada (${faltan} ${faltan === 1 ? 'archivo no estaba' : 'archivos no estaban'} en este dispositivo)` : `Copia descargada${archivos ? ` con ${archivos} ${archivos === 1 ? 'archivo' : 'archivos'}` : ''}`);
      paintBackupStatus();
    } catch (e) { console.warn(e); toast('No se pudo crear la copia'); paintBackupStatus(); }
  };
  const fileInput = h('input', { type: 'file', accept: '.zip,application/zip,application/json,.json', class: 'sr-only', id: 'aj-import' });
  const importBox = h('div', { class: 'confirm-box', hidden: true });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    // Confirmación dentro de la página
    importBox.replaceChildren(
      h('p', {}, `¿Restaurar «${f.name}»? Se sustituirán los datos actuales${getSyncState().user ? ' (también en la nube)' : ''}.`),
      h('div', { class: 'settings-actions' },
        h('button', { class: 'btn btn-primary', onclick: async () => {
          try {
            const { restoreBackup } = await import('../backup.js');
            const r = await restoreBackup(f, (t) => paintBackupStatus(t));
            toast(r.archivos ? `Copia restaurada con ${r.archivos} archivos` : 'Copia restaurada');
            setTimeout(() => location.reload(), 700);
          } catch (e) { toast(e.message || 'No se pudo leer el archivo'); paintBackupStatus(); }
        } }, 'Restaurar'),
        h('button', { class: 'btn btn-ghost', onclick: () => { importBox.hidden = true; fileInput.value = ''; } }, 'Cancelar')));
    importBox.hidden = false;
  });

  // --- Sincronización ---
  const syncBody = h('div');
  function paintSync() {
    const st = getSyncState();
    const parts = [];
    if (!st.enabled) {
      parts.push(h('p', { class: 'settings-text' }, 'Tus datos se guardan solo en este dispositivo. Cuando se configure la conexión con la nube, podrás iniciar sesión con Google y usarlos en el móvil, la tablet y el ordenador.'));
    } else if (!st.user) {
      parts.push(
        h('p', { class: 'settings-text' }, 'Inicia sesión con tu cuenta de Google para tener tus datos en todos tus dispositivos. Lo que ya tengas en este dispositivo se subirá a tu cuenta.'),
        h('div', { class: 'settings-actions' },
          googleButton(() => signIn().catch(() => {}), { disabled: st.status === 'loading' })));
    } else {
      const confirmOut = h('div', { class: 'confirm-box', hidden: true },
        h('p', {}, 'Al cerrar sesión se borrarán los datos de este dispositivo. Seguirán guardados en tu cuenta.'),
        h('div', { class: 'settings-actions' },
          h('button', { class: 'btn btn-danger', onclick: () => signOutAndClear() }, 'Cerrar sesión y borrar'),
          h('button', { class: 'btn btn-ghost', onclick: () => { confirmOut.hidden = true; } }, 'Cancelar')));
      parts.push(
        h('div', { class: 'sync-account' },
          h('span', { class: 'avatar', 'aria-hidden': 'true' }, (st.user.name || st.user.email || '?')[0].toUpperCase()),
          h('span', { class: 'user-label' },
            h('span', { class: 'user-name' }, st.user.name || st.user.email),
            h('span', { class: `user-sub sync-${st.status}` }, `${st.user.email} · ${SYNC_LABELS[st.status]}`))),
        st.status === 'offline' ? h('p', { class: 'settings-text' }, 'Sin conexión: los cambios se guardan y se subirán al recuperar la red.') : null,
        h('div', { class: 'settings-actions' }, h('button', { class: 'btn', onclick: () => { confirmOut.hidden = false; } }, 'Cerrar sesión')),
        confirmOut);
    }
    if (st.error) parts.push(h('p', { class: 'sync-error', role: 'alert' }, st.error));
    syncBody.replaceChildren(...parts);
  }
  paintSync();
  const unsubSync = onSyncChange(paintSync);

  // --- Bloqueo ---
  const lockBody = h('div');
  let lockMode = null; // null | 'activar' | 'cambiar' | 'desactivar'
  const pinInput = (id, label) => {
    const input = h('input', { class: 'input pin-input', id, type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '6', pattern: '[0-9]*', placeholder: '••••' });
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
    return [h('div', { class: 'field' }, h('label', { for: id }, label), input), input];
  };
  async function paintLock() {
    const on = isLockEnabled();
    const parts = [h('p', { class: 'settings-text' }, 'Pide un PIN al abrir Tabula y tras un rato sin usarla, para que nadie vea las notas si dejas el móvil o la tablet a la vista. Es un bloqueo de pantalla: no cifra los datos.')];
    const err = h('p', { class: 'sync-error', role: 'alert', hidden: true });
    const fail = (m) => { err.textContent = m; err.hidden = false; };

    if (lockMode === 'activar' || lockMode === 'cambiar') {
      const fields = [];
      let cur = null;
      if (lockMode === 'cambiar') { const [f, i] = pinInput('lk-actual', 'PIN actual'); fields.push(f); cur = i; }
      const [f1, p1] = pinInput('lk-nuevo', lockMode === 'cambiar' ? 'PIN nuevo (4 a 6 cifras)' : 'Elige un PIN (4 a 6 cifras)');
      const [f2, p2] = pinInput('lk-repite', 'Repite el PIN');
      fields.push(f1, f2);
      const save = async () => {
        if (cur && !(await verifyPin(cur.value))) return fail('El PIN actual no es correcto.');
        if (!isValidPin(p1.value)) return fail('El PIN debe tener de 4 a 6 cifras.');
        if (p1.value !== p2.value) return fail('Los dos PIN no coinciden.');
        if (/^(\d)\1+$/.test(p1.value) || '0123456789'.includes(p1.value) || '9876543210'.includes(p1.value)) return fail('Elige un PIN menos obvio (sin repeticiones ni secuencias).');
        await setPin(p1.value);
        lockMode = null; toast(cur ? 'PIN cambiado' : 'Bloqueo activado'); paintLock();
      };
      parts.push(h('form', { class: 'lock-form', onsubmit: (e) => { e.preventDefault(); save(); } }, ...fields, err,
        h('div', { class: 'settings-actions' },
          h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar PIN'),
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { lockMode = null; paintLock(); } }, 'Cancelar'))));
    } else if (lockMode === 'desactivar') {
      const [f, i] = pinInput('lk-off', 'PIN actual');
      parts.push(h('form', { class: 'lock-form', onsubmit: async (e) => {
        e.preventDefault();
        try { await disableLock(i.value); lockMode = null; toast('Bloqueo desactivado'); paintLock(); } catch (x) { fail(x.message); }
      } }, f, err, h('div', { class: 'settings-actions' },
        h('button', { class: 'btn btn-danger', type: 'submit' }, 'Desactivar bloqueo'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { lockMode = null; paintLock(); } }, 'Cancelar'))));
    } else if (!on) {
      parts.push(h('div', { class: 'settings-actions' },
        h('button', { class: 'btn btn-primary', onclick: () => { lockMode = 'activar'; paintLock(); } }, icon('lock', 18), 'Activar bloqueo con PIN')));
    } else {
      const sel = h('select', { class: 'select', id: 'lk-tiempo' },
        ...TIMEOUTS.map((t) => h('option', { value: String(t.min), selected: t.min === lockTimeout() }, t.label)));
      sel.addEventListener('change', () => { setLockTimeout(Number(sel.value)); toast('Guardado'); });
      parts.push(h('div', { class: 'field' }, h('label', { for: 'lk-tiempo' }, 'Bloquear'), sel));
      if (await biometricAvailable()) {
        const bio = h('input', { type: 'checkbox', id: 'lk-bio', class: 'switch', checked: hasBiometric() });
        bio.addEventListener('change', async () => {
          try {
            if (bio.checked) { await enableBiometric(); toast('Huella o Face ID activado'); }
            else { disableBiometric(); toast('Huella o Face ID desactivado'); }
          } catch (x) { bio.checked = false; fail(x.name === 'NotAllowedError' ? 'Se canceló el registro de la huella.' : (x.message || 'No se pudo activar.')); }
        });
        parts.push(h('label', { class: 'switch-row', for: 'lk-bio' }, h('span', {}, 'Desbloquear con huella o Face ID'), bio));
      }
      parts.push(err, h('div', { class: 'settings-actions' },
        h('button', { class: 'btn', onclick: () => lockNow() }, icon('lock', 18), 'Bloquear ahora'),
        h('button', { class: 'btn', onclick: () => { lockMode = 'cambiar'; paintLock(); } }, 'Cambiar PIN'),
        h('button', { class: 'btn btn-ghost btn-danger', onclick: () => { lockMode = 'desactivar'; paintLock(); } }, 'Desactivar')));
    }
    lockBody.replaceChildren(...parts);
    const first = lockBody.querySelector('.pin-input'); if (first) first.focus();
  }
  paintLock();
  const unsubLock = onLockConfigChange(() => { if (!lockMode) paintLock(); });

  const calEsc = calendarioEscolarCard();
  container.replaceChildren(
    h('header', { class: 'page-head' }, h('div', {}, h('h1', { class: 'page-title' }, 'Ajustes'))),
    h('div', { class: 'settings' },
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Perfil')),
        h('div', { class: 'field' }, h('label', { for: 'aj-nombre' }, 'Nombre'), nombre),
        h('div', { class: 'field' }, h('label', { for: 'aj-centro' }, 'Grupo y centro'), centro)),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Apariencia')),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Modo'),
          h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Tema' }, ...themeBtns)),
        h('div', { class: 'field', style: { marginBottom: '0' } }, h('span', { class: 'field-label' }, 'Color'), swatches)),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Evaluación')),
        h('p', { class: 'settings-text' }, 'Configuración que tendrán los cuadernos nuevos. Cada cuaderno puede cambiarla después.'),
        evSeg('escala', 'Forma de calificar', [['numerica', 'Notas (0–10)'], ['niveles', 'Niveles (IN–SB)']]),
        evSeg('modo', 'Cálculo de la nota', [['porcentajes', 'Por porcentajes'], ['criterios', 'Por criterios (Séneca)']]),
        evSeg('final', 'Nota final', [['continua', 'Evaluación continua'], ['media', 'Media de evaluaciones']])),
      menuCard(),
      calEsc.el,
      nuevoCursoCard(),
      guiaCard(),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Bloqueo')),
        lockBody),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Cuenta y sincronización')),
        syncBody),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Copia de seguridad')),
        h('p', { class: 'settings-text' }, 'Descarga en un solo archivo (.zip) todos tus datos y los archivos de Documentos. Guárdala de vez en cuando aunque uses la sincronización.'),
        backupStatus,
        h('div', { class: 'settings-actions' },
          h('button', { class: 'btn', onclick: exportData }, icon('download', 18), 'Descargar copia'),
          h('button', { class: 'btn', onclick: () => fileInput.click() }, icon('upload', 18), 'Restaurar copia'), fileInput),
        importBox)),
  );
  return () => { unsubSync(); unsubLock(); calEsc.destroy(); };
}
