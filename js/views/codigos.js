// Tabula · Códigos: licencias de libros digitales, clave de la impresora, wifi, plataformas…
// codigos { id, titulo, categoria, usuario, codigo, codigoCifrado?: { iv, ct }, enlace, notas }
// Se sincronizan con la cuenta. El código va oculto: se muestra o copia a petición.
// Con «clave de códigos» (ajuste 'codigosCifrado', ver codigos-crypto.js) el código se cifra en el dispositivo
// y en la cuenta solo queda codigoCifrado; para verlo hay que escribir la clave (vale 10 min).
// Sin clave, si la app tiene bloqueo con PIN, se pide el PIN antes (vale 5 min).

import { store } from '../store.js';
import { h, icon, toast, openSheet } from '../ui.js';
import { isLockEnabled, verifyPin } from '../lock.js';
import { newVault, openVault, encryptText, decryptText, validPassphrase } from '../codigos-crypto.js';

const COL = 'codigos';
export const CATEGORIAS = {
  libro: { label: 'Libro digital', icon: 'documentos' },
  impresora: { label: 'Impresora', icon: 'printer' },
  plataforma: { label: 'Plataforma o web', icon: 'link' },
  wifi: { label: 'Wifi', icon: 'sidebar' },
  aula: { label: 'Aula y candados', icon: 'lock' },
  otro: { label: 'Otro', icon: 'tag' },
};
const OCULTO = '••••••••';
const VISIBLE_MS = 30000;
const PIN_OK_MS = 5 * 60000;

let pinOkHasta = 0;
const KEY_MS = 10 * 60000;
let vaultKey = null, vaultHasta = 0;
const vaultCfg = () => store.getSetting('codigosCifrado', null);
const hasCode = (c) => !!(c.codigo || c.codigoCifrado);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Si hay bloqueo con PIN, lo pide antes de enseñar o copiar un código. */
function confirmPin() {
  if (!isLockEnabled() || Date.now() < pinOkHasta) return Promise.resolve(true);
  return new Promise((resolve) => {
    let ok = false;
    const input = h('input', { class: 'input cd-pin', id: 'cd-pin', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '6', 'aria-describedby': 'cd-pin-err' });
    const err = h('p', { class: 'sync-error', id: 'cd-pin-err', role: 'alert', hidden: true });
    const form = h('form', { class: 'cd-pin-form', onsubmit: async (e) => {
      e.preventDefault();
      if (await verifyPin(input.value.trim())) { ok = true; pinOkHasta = Date.now() + PIN_OK_MS; close(); }
      else { err.hidden = false; err.textContent = 'PIN incorrecto.'; input.select(); }
    } },
    h('p', { class: 'settings-text' }, 'Escribe el PIN de Tabula para ver los códigos.'),
    h('div', { class: 'field' }, h('label', { for: 'cd-pin' }, 'PIN'), input), err,
    h('div', { class: 'settings-actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Confirmar')));
    const close = openSheet('Confirmar PIN', form, { onClose: () => resolve(ok) });
    setTimeout(() => input.focus(), 50);
  });
}

/** Pide la clave de códigos (si hace falta) y devuelve la llave, o null si se cancela. */
function unlockVault() {
  const cfg = vaultCfg();
  if (vaultKey && Date.now() < vaultHasta) return Promise.resolve(vaultKey);
  return new Promise((resolve) => {
    let key = null;
    const input = h('input', { class: 'input', id: 'cd-clave', type: 'password', autocomplete: 'current-password', 'aria-describedby': 'cd-clave-err' });
    const err = h('p', { class: 'sync-error', id: 'cd-clave-err', role: 'alert', hidden: true });
    const btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Desbloquear');
    const form = h('form', { class: 'cd-pin-form', onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true; btn.textContent = 'Comprobando…';
      key = await openVault(cfg, input.value);
      btn.disabled = false; btn.textContent = 'Desbloquear';
      if (key) { vaultKey = key; vaultHasta = Date.now() + KEY_MS; close(); }
      else { err.hidden = false; err.textContent = 'La clave no es correcta.'; input.select(); }
    } },
    h('p', { class: 'settings-text' }, 'Tus códigos están cifrados. Escribe tu clave de códigos para verlos (no se vuelve a pedir en 10 minutos).'),
    h('div', { class: 'field' }, h('label', { for: 'cd-clave' }, 'Clave de códigos'), input), err,
    h('div', { class: 'settings-actions' }, btn));
    const close = openSheet('Desbloquear códigos', form, { onClose: () => resolve(key) });
    setTimeout(() => input.focus(), 50);
  });
}

/** Permiso para ver un código: la clave si están cifrados; si no, el PIN (si lo hay). */
const unlock = () => (vaultCfg() ? unlockVault() : confirmPin());

/** Texto del código (descifrándolo si hace falta; requiere haber desbloqueado). */
async function codeOf(c) {
  if (!c.codigoCifrado) return c.codigo || '';
  return decryptText(vaultKey, c.codigoCifrado);
}

/** Activar el cifrado: elige la clave y se cifran todos los códigos que haya. */
function vaultSetupSheet() {
  const p1 = h('input', { class: 'input', id: 'cd-v1', type: 'password', autocomplete: 'new-password', minlength: '8' });
  const p2 = h('input', { class: 'input', id: 'cd-v2', type: 'password', autocomplete: 'new-password' });
  const ok = h('input', { type: 'checkbox', id: 'cd-v-ok' });
  const err = h('p', { class: 'sync-error', role: 'alert', hidden: true });
  const btn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Cifrar mis códigos');
  const fail = (t) => { err.hidden = false; err.textContent = t; };
  const form = h('form', { class: 'cd-form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (!validPassphrase(p1.value)) return fail('La clave debe tener al menos 8 caracteres.');
    if (p1.value !== p2.value) return fail('Las dos claves no coinciden.');
    if (!ok.checked) return fail('Marca la casilla para confirmar que lo has entendido.');
    btn.disabled = true; btn.textContent = 'Cifrando…';
    const { cfg, key } = await newVault(p1.value);
    for (const c of store.list(COL)) {
      if (c.codigo && !c.codigoCifrado) store.update(COL, c.id, { codigo: '', codigoCifrado: await encryptText(key, c.codigo) });
    }
    store.setSetting('codigosCifrado', cfg);
    vaultKey = key; vaultHasta = Date.now() + KEY_MS;
    close();
    toast('Códigos cifrados con tu clave');
  } },
  h('p', { class: 'settings-text' }, 'Elige una clave solo para tus códigos (puede ser una frase). Se cifran en este dispositivo antes de guardarse: en tu cuenta solo queda texto ilegible. Usarás la misma clave en todos tus dispositivos.'),
  h('div', { class: 'field' }, h('label', { for: 'cd-v1' }, 'Clave de códigos (mínimo 8 caracteres)'), p1),
  h('div', { class: 'field' }, h('label', { for: 'cd-v2' }, 'Repite la clave'), p2),
  h('label', { class: 'cd-check', for: 'cd-v-ok' }, ok, h('span', {}, 'Entiendo que si olvido esta clave, mis códigos no se pueden recuperar.')),
  err, h('div', { class: 'settings-actions' }, btn));
  const close = openSheet('Cifrar mis códigos', form);
}

/** Quitar el cifrado: descifra todos los códigos (pide la clave). */
async function vaultRemove() {
  const key = await unlockVault();
  if (!key) return;
  if (!window.confirm('Los códigos dejarán de estar cifrados con tu clave. ¿Continuar?')) return;
  for (const c of store.list(COL)) {
    if (c.codigoCifrado) store.update(COL, c.id, { codigo: await decryptText(key, c.codigoCifrado), codigoCifrado: null });
  }
  store.setSetting('codigosCifrado', null);
  vaultKey = null;
  toast('Cifrado quitado');
}

async function copy(text, what = 'Código') {
  try { await navigator.clipboard.writeText(text); toast(`${what} copiado`); }
  catch { toast('No se pudo copiar: mantén pulsado el código para seleccionarlo'); }
}

/** Hoja para crear o editar un código (con cifrado, pide la clave antes). */
async function editSheet(id = null) {
  const c = id ? store.get(COL, id) : null;
  if (vaultCfg() && !(await unlockVault())) return;
  const actual = c ? await codeOf(c).catch(() => '') : '';
  const val = (k) => (k === 'codigo' ? actual : (c && c[k]) || '');
  const inp = (key, label, attrs = {}) => {
    const el = h(attrs.area ? 'textarea' : 'input', { class: 'input', id: `cd-f-${key}`, autocomplete: 'off', ...attrs, area: null, value: val(key) });
    return { el, field: h('div', { class: 'field' }, h('label', { for: `cd-f-${key}` }, label), el) };
  };
  const titulo = inp('titulo', 'Nombre', { placeholder: 'Ej. Lengua 4º · Santillana', required: true, maxlength: '120' });
  const usuario = inp('usuario', 'Usuario o correo (opcional)', { maxlength: '200', autocapitalize: 'off' });
  const codigo = inp('codigo', 'Código o contraseña', { maxlength: '500', autocapitalize: 'off', spellcheck: 'false' });
  const enlace = inp('enlace', 'Enlace (opcional)', { type: 'url', placeholder: 'https://…', maxlength: '500' });
  const notas = inp('notas', 'Notas (opcional)', { area: true, rows: '3', maxlength: '1000' });
  const cat = h('select', { class: 'input', id: 'cd-f-categoria' },
    Object.entries(CATEGORIAS).map(([k, v]) => h('option', { value: k, selected: (c?.categoria || 'libro') === k }, v.label)));
  const err = h('p', { class: 'sync-error', role: 'alert', hidden: true });

  const form = h('form', { class: 'cd-form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const data = {
      titulo: titulo.el.value.trim(), categoria: cat.value, usuario: usuario.el.value.trim(),
      codigo: codigo.el.value.trim(), enlace: enlace.el.value.trim(), notas: notas.el.value.trim(),
    };
    if (!data.titulo) { err.hidden = false; err.textContent = 'Ponle un nombre.'; titulo.el.focus(); return; }
    if (data.enlace && !/^https?:\/\//i.test(data.enlace)) data.enlace = `https://${data.enlace}`;
    if (vaultCfg()) {
      if (!vaultKey) { err.hidden = false; err.textContent = 'Desbloquea los códigos para guardar.'; return; }
      data.codigoCifrado = data.codigo ? await encryptText(vaultKey, data.codigo) : null;
      data.codigo = '';
    }
    if (c) store.update(COL, c.id, data); else store.add(COL, data);
    close();
    toast(c ? 'Código guardado' : 'Código añadido');
  } },
  titulo.field, h('div', { class: 'field' }, h('label', { for: 'cd-f-categoria' }, 'Tipo'), cat),
  usuario.field, codigo.field, enlace.field, notas.field, err,
  h('div', { class: 'settings-actions' },
    h('button', { type: 'submit', class: 'btn btn-primary' }, c ? 'Guardar' : 'Añadir'),
    c ? h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: () => {
      const removed = store.remove(COL, c.id);
      close();
      toast('Código eliminado', { label: 'Deshacer', run: () => store.restore(COL, removed) });
    } }, icon('trash', 15), 'Eliminar') : ''));
  const close = openSheet(c ? 'Editar código' : 'Nuevo código', form);
}

export function render(container) {
  let query = '', filtro = '';
  const visibles = new Map();   // id → temporizador que lo vuelve a ocultar
  const list = h('div', { class: 'cd-list' });
  const chips = h('div', { class: 'cd-chips', role: 'group', 'aria-label': 'Filtrar por tipo' });
  const search = h('input', {
    class: 'input cd-search', type: 'search', placeholder: 'Buscar por nombre, usuario o notas', 'aria-label': 'Buscar códigos',
    oninput: (e) => { query = norm(e.target.value); paint(); },
  });

  const hide = (id) => { clearTimeout(visibles.get(id)?.t); visibles.delete(id); paint(); };
  async function reveal(c) {
    if (visibles.has(c.id)) { hide(c.id); return; }
    if (!(await unlock())) return;
    let text;
    try { text = await codeOf(c); } catch { toast('No se pudo descifrar este código'); return; }
    visibles.set(c.id, { text, t: setTimeout(() => hide(c.id), VISIBLE_MS) });
    paint();
  }
  async function copyCode(c) {
    if (!(await unlock())) return;
    try { copy(await codeOf(c)); } catch { toast('No se pudo descifrar este código'); }
  }

  function card(c) {
    const cat = CATEGORIAS[c.categoria] || CATEGORIAS.otro;
    const shown = visibles.has(c.id);
    return h('article', { class: 'card cd-card', dataset: { id: c.id } },
      h('div', { class: 'cd-head' },
        h('span', { class: 'cd-ico', 'aria-hidden': 'true' }, icon(cat.icon, 18)),
        h('div', { class: 'cd-title-box' }, h('h2', { class: 'cd-title' }, c.titulo), h('span', { class: 'cd-cat' }, cat.label)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Editar ${c.titulo}`, onclick: () => editSheet(c.id) }, icon('edit', 18))),
      c.usuario ? h('div', { class: 'cd-row' }, h('span', { class: 'cd-k' }, 'Usuario'),
        h('span', { class: 'cd-v' }, c.usuario),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': `Copiar usuario de ${c.titulo}`, onclick: () => copy(c.usuario, 'Usuario') }, 'Copiar')) : '',
      hasCode(c) ? h('div', { class: 'cd-row' }, h('span', { class: 'cd-k' }, 'Código'),
        h('span', { class: `cd-v cd-code${shown ? ' is-shown' : ''}`, 'aria-label': shown ? visibles.get(c.id).text : 'Código oculto' }, shown ? visibles.get(c.id).text : OCULTO),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-pressed': String(shown), onclick: () => reveal(c) }, shown ? 'Ocultar' : 'Mostrar'),
        h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Copiar código de ${c.titulo}`, onclick: () => copyCode(c) }, 'Copiar')) : '',
      c.notas ? h('p', { class: 'cd-notas' }, c.notas) : '',
      c.enlace ? h('a', { class: 'btn btn-sm cd-open', href: c.enlace, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 15), 'Abrir') : '');
  }

  const vaultBox = h('div', { class: 'cd-vault' });
  function paintVault() {
    if (vaultCfg()) {
      vaultBox.className = 'cd-vault is-on';
      vaultBox.replaceChildren(icon('lock', 16), h('span', {}, 'Cifrados con tu clave de códigos.'),
        vaultKey && Date.now() < vaultHasta ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { vaultKey = null; visibles.forEach((v) => clearTimeout(v.t)); visibles.clear(); paint(); toast('Códigos bloqueados'); } }, 'Bloquear ahora') : '',
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: vaultRemove }, 'Quitar cifrado'));
    } else {
      vaultBox.className = 'cd-vault';
      vaultBox.replaceChildren(icon('lock', 16), h('span', {}, h('strong', {}, 'Protege tus códigos con una clave. '), 'Se cifran en tu dispositivo y nadie más puede leerlos.'),
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', id: 'cd-cifrar', onclick: vaultSetupSheet }, 'Cifrar'));
    }
  }

  function paint() {
    paintVault();
    const all = store.list(COL).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
    const used = Object.keys(CATEGORIAS).filter((k) => all.some((c) => (c.categoria || 'otro') === k));
    chips.hidden = used.length < 2;
    chips.replaceChildren(...['', ...used].map((k) => h('button', {
      type: 'button', class: `cd-chip${filtro === k ? ' is-on' : ''}`, 'aria-pressed': String(filtro === k), onclick: () => { filtro = k; paint(); },
    }, k ? CATEGORIAS[k].label : 'Todos')));
    const shown = all.filter((c) => (!filtro || (c.categoria || 'otro') === filtro)
      && (!query || norm(`${c.titulo} ${c.usuario} ${c.notas} ${CATEGORIAS[c.categoria]?.label || ''}`).includes(query)));
    if (!all.length) {
      list.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'empty' }, icon('lock', 40),
        h('strong', {}, 'Aún no tienes códigos guardados'),
        'Guarda aquí las licencias de los libros digitales, la clave de la impresora, la del wifi del centro…',
        h('button', { type: 'button', class: 'btn btn-primary', style: { marginTop: '12px' }, onclick: () => editSheet() }, icon('plus', 16), 'Añadir el primero'))));
      return;
    }
    list.replaceChildren(...(shown.length ? shown.map(card) : [h('p', { class: 'cd-none' }, 'Nada coincide con la búsqueda.')]));
  }

  container.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Libros digitales, impresora, wifi…'), h('h1', { class: 'page-title' }, 'Códigos')),
      h('button', { type: 'button', class: 'btn btn-primary', id: 'cd-nuevo', onclick: () => editSheet() }, icon('plus', 16), 'Nuevo código')),
    vaultBox,
    h('div', { class: 'cd-tools' }, search, chips),
    list,
    h('p', { class: 'cd-privacy' }, icon('lock', 14), h('span', {},
      'Los códigos se guardan en tu cuenta y solo tú puedes verlos; con la clave de códigos, además, van cifrados. ',
      'No guardes aquí contraseñas importantes como las de Séneca, el correo o el banco: para esas usa un gestor de contraseñas.')));
  paint();
  const off = store.subscribe(COL, paint);
  const off2 = store.subscribe('settings', paint);
  return () => { off(); off2(); visibles.forEach((v) => clearTimeout(v.t)); };
}
