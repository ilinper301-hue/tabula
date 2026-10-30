// Tabula · Códigos: licencias de libros digitales, clave de la impresora, wifi, plataformas…
// codigos { id, titulo, categoria, usuario, codigo, enlace, notas }
// Se sincronizan con la cuenta como el resto de colecciones. El código va oculto: se muestra o copia a petición
// y, si la app tiene bloqueo con PIN, hay que confirmarlo antes (vale unos minutos).

import { store } from '../store.js';
import { h, icon, toast, openSheet } from '../ui.js';
import { isLockEnabled, verifyPin } from '../lock.js';

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

async function copy(text, what = 'Código') {
  try { await navigator.clipboard.writeText(text); toast(`${what} copiado`); }
  catch { toast('No se pudo copiar: mantén pulsado el código para seleccionarlo'); }
}

/** Hoja para crear o editar un código. */
function editSheet(id = null) {
  const c = id ? store.get(COL, id) : null;
  const val = (k) => (c && c[k]) || '';
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

  const form = h('form', { class: 'cd-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const data = {
      titulo: titulo.el.value.trim(), categoria: cat.value, usuario: usuario.el.value.trim(),
      codigo: codigo.el.value.trim(), enlace: enlace.el.value.trim(), notas: notas.el.value.trim(),
    };
    if (!data.titulo) { err.hidden = false; err.textContent = 'Ponle un nombre.'; titulo.el.focus(); return; }
    if (data.enlace && !/^https?:\/\//i.test(data.enlace)) data.enlace = `https://${data.enlace}`;
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

  const hide = (id) => { clearTimeout(visibles.get(id)); visibles.delete(id); paint(); };
  async function reveal(id) {
    if (visibles.has(id)) { hide(id); return; }
    if (!(await confirmPin())) return;
    visibles.set(id, setTimeout(() => hide(id), VISIBLE_MS));
    paint();
  }
  async function copyCode(c) { if (await confirmPin()) copy(c.codigo); }

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
      c.codigo ? h('div', { class: 'cd-row' }, h('span', { class: 'cd-k' }, 'Código'),
        h('span', { class: `cd-v cd-code${shown ? ' is-shown' : ''}`, 'aria-label': shown ? c.codigo : 'Código oculto' }, shown ? c.codigo : OCULTO),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-pressed': String(shown), onclick: () => reveal(c.id) }, shown ? 'Ocultar' : 'Mostrar'),
        h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Copiar código de ${c.titulo}`, onclick: () => copyCode(c) }, 'Copiar')) : '',
      c.notas ? h('p', { class: 'cd-notas' }, c.notas) : '',
      c.enlace ? h('a', { class: 'btn btn-sm cd-open', href: c.enlace, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 15), 'Abrir') : '');
  }

  function paint() {
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
    h('div', { class: 'cd-tools' }, search, chips),
    list,
    h('p', { class: 'cd-privacy' }, icon('lock', 14), h('span', {},
      'Los códigos se guardan en tu cuenta, como el resto de Tabula, y solo tú puedes verlos. ',
      isLockEnabled() ? 'Para verlos se pide tu PIN. ' : 'Activa el bloqueo con PIN en Ajustes para que se pida antes de verlos. ',
      'No guardes aquí contraseñas importantes como las de Séneca, el correo o el banco: para esas usa un gestor de contraseñas.')));
  paint();
  const off = store.subscribe(COL, paint);
  return () => { off(); visibles.forEach((t) => clearTimeout(t)); };
}
