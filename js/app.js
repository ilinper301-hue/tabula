// Tabula · arranque, navegación y estructura

import { store } from './store.js';
import { h, icon, logoLockup } from './ui.js';
import { initSync, getSyncState, onSyncChange, SYNC_LABELS } from './sync.js';
import './plan-sync.js';
import { initLock, setForgotHandler, resetLock } from './lock.js';
import { signOutAndClear } from './sync.js';

// Módulos de la app. `fase` indica cuándo se construye cada uno.
const ROUTES = [
  { id: 'hoy', label: 'Hoy', icon: 'hoy', load: () => import('./views/hoy.js'), mobile: true },
  { id: 'tareas', label: 'Tareas', icon: 'tareas', load: () => import('./views/tareas.js'), mobile: true, count: true },
  { id: 'documentos', label: 'Documentos', icon: 'documentos', fase: 2 },
  { id: 'calendario', label: 'Calendario', icon: 'calendario', load: () => import('./views/calendario.js'), mobile: true },
  { id: 'grupos', label: 'Grupos', icon: 'grupos', load: () => import('./views/grupos.js'), mobile: true },
  { id: 'cuaderno', label: 'Cuaderno', icon: 'cuaderno', load: () => import('./views/cuaderno.js') },
  { id: 'planificacion', label: 'Planificación', icon: 'planificacion', load: () => import('./views/planificacion.js') },
  { id: 'programas', label: 'Planes y programas', icon: 'programas', load: () => import('./views/programas.js') },
  { id: 'encuestas', label: 'Encuestas', icon: 'encuestas', load: () => import('./views/encuestas.js') },
];
const EXTRA = [
  { id: 'ajustes', label: 'Ajustes', icon: 'ajustes', load: () => import('./views/ajustes.js') },
  { id: 'mas', label: 'Más', icon: 'mas', load: () => import('./views/mas.js') },
  { id: 'bienvenida', label: 'Bienvenida', icon: 'hoy', load: () => import('./views/bienvenida.js') },
];
const ALL = [...ROUTES, ...EXTRA];

const sidebar = document.getElementById('sidebar');
const bottomNav = document.getElementById('bottom-nav');
const viewEl = document.getElementById('view');
let cleanup = null;
let currentId = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const id = ALL.some((r) => r.id === path) ? path : 'hoy';
  return { id, params: new URLSearchParams(query) };
}

function pendingCount() {
  return store.list('tasks').filter((t) => !t.done).length;
}

function renderNav(activeId) {
  const profile = store.getSetting('profile', { nombre: '', centro: '' });
  const count = pendingCount();
  const link = (r) => h('a', {
    class: 'nav-link', href: `#/${r.id}`, title: r.label,
    'aria-current': r.id === activeId ? 'page' : null,
  }, icon(r.icon, 19), h('span', { class: 'label' }, r.label),
  r.count && count ? h('span', { class: 'count' }, String(count)) : null);

  const sync = getSyncState();
  const displayName = profile.nombre || (sync.user && sync.user.name) || '';
  const initials = (displayName || 'Tú').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const sub = sync.enabled ? SYNC_LABELS[sync.status] : (profile.centro || 'Ajustes');

  sidebar.replaceChildren(
    h('a', { class: 'brand', href: '#/hoy', 'aria-label': 'Tabula, ir a Hoy' }, logoLockup({ size: 34 })),
    ...ROUTES.map(link),
    h('div', { class: 'side-spacer' }),
    h('a', {
      class: 'nav-link', href: '#/ajustes', title: 'Ajustes',
      'aria-current': activeId === 'ajustes' ? 'page' : null,
    },
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials),
    h('span', { class: 'label user-label' },
      h('span', { class: 'user-name' }, displayName || 'Mi perfil'),
      h('span', { class: `user-sub sync-${sync.status}` }, sub))),
  );

  const mobileBrand = document.getElementById('mobile-brand');
  if (mobileBrand && !mobileBrand.firstChild) {
    mobileBrand.append(h('a', { href: '#/hoy', class: 'brand', 'aria-label': 'Tabula, ir a Hoy' }, logoLockup({ size: 30 })));
  }
  // En el móvil, el logotipo encabeza la pantalla principal (Hoy)
  if (mobileBrand) mobileBrand.hidden = activeId !== 'hoy';

  const mob = ROUTES.filter((r) => r.mobile);
  const moreActive = !mob.some((r) => r.id === activeId);
  bottomNav.replaceChildren(
    ...mob.map((r) => h('a', { href: `#/${r.id}`, 'aria-current': r.id === activeId ? 'page' : null },
      icon(r.icon, 22), r.label)),
    h('a', { href: '#/mas', 'aria-current': moreActive ? 'page' : null }, icon('mas', 22), 'Más'),
  );
}

function placeholder(route) {
  return {
    render(container) {
      container.replaceChildren(
        h('header', { class: 'page-head' },
          h('div', {}, h('div', { class: 'eyebrow' }, `Fase ${route.fase}`),
            h('h1', { class: 'page-title' }, route.label))),
        h('div', { class: 'card' },
          h('div', { class: 'empty' }, icon(route.icon, 40),
            h('strong', {}, 'Este módulo está en preparación'),
            'Lo construiremos en una próxima fase.'))
      );
    },
  };
}

async function navigate() {
  const { id, params } = parseHash();
  const route = ALL.find((r) => r.id === id);

  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  renderNav(id);
  document.title = route.id === 'hoy' ? 'Tabula' : `${route.label} · Tabula`;

  let mod;
  try {
    mod = route.load ? await route.load() : placeholder(route);
  } catch (e) {
    console.error(e);
    mod = placeholder({ ...route, fase: '·' });
  }
  // Si el usuario navegó a otro sitio mientras cargaba, no pintamos
  if (parseHash().id !== id) return;
  viewEl.replaceChildren();
  cleanup = mod.render(viewEl, params) || null;
  if (currentId !== id) { window.scrollTo(0, 0); currentId = id; }
}

window.addEventListener('hashchange', navigate);
store.subscribe('tasks', () => renderNav(parseHash().id));
store.subscribe('settings', () => renderNav(parseHash().id));

// Tema según sistema si el usuario no ha elegido
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
export const ACCENTS = [
  ['azul', 'Azul', '#3E5C76'], ['terracota', 'Terracota', '#AE5630'], ['verde', 'Verde', '#4F6B4A'],
  ['morado', 'Morado', '#6B4E7A'], ['petroleo', 'Petróleo', '#2E6A6A'], ['grafito', 'Grafito', '#3D3C38'],
];
export function applyAccent() {
  const a = store.getSetting('accent', 'azul');
  if (a && a !== 'terracota' && ACCENTS.some(([k]) => k === a)) document.documentElement.dataset.accent = a;
  else delete document.documentElement.dataset.accent;
}
// El color se sincroniza entre dispositivos: se reaplica si llega de la nube
store.subscribe('settings', applyAccent);
applyAccent();

export function applyTheme() {
  const t = store.getSetting('theme', 'system');
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
}

// Bloqueo: se activa antes de pintar nada
setForgotHandler((card) => {
  if (card.querySelector('.lock-reset')) return;
  const account = getSyncState().user;
  const box = h('div', { class: 'lock-reset confirm-box' });
  if (account) {
    box.append(
      h('p', {}, `Puedes cerrar la sesión de ${account.email} y borrar los datos de este dispositivo. Tus datos siguen en tu cuenta: al volver a iniciar sesión se recuperan.`),
      h('button', { class: 'btn btn-danger', onclick: async () => { resetLock(); await signOutAndClear(); } }, 'Cerrar sesión y borrar'));
  } else {
    const input = h('input', { class: 'input', id: 'lock-borrar', autocomplete: 'off', placeholder: 'BORRAR' });
    box.append(
      h('p', {}, 'Sin cuenta conectada, la única forma de entrar es borrar todos los datos de este dispositivo. Se perderán, salvo que tengas una copia de seguridad. Escribe BORRAR para confirmar.'),
      h('label', { class: 'sr-only', for: 'lock-borrar' }, 'Escribe BORRAR para confirmar'), input,
      h('button', { class: 'btn btn-danger', style: { marginTop: '10px' }, onclick: () => {
        if (input.value.trim().toUpperCase() !== 'BORRAR') { input.focus(); return; }
        resetLock(); store._clearLocal(); location.reload();
      } }, 'Borrar datos de este dispositivo'));
  }
  card.append(box);
});
initLock();

// Primer uso: asistente (nunca para quien ya tiene datos o enlazó una cuenta en este dispositivo)
if (!location.hash || location.hash === '#/' || location.hash === '#/hoy') {
  const { needsOnboarding } = await import('./views/bienvenida.js');
  if (needsOnboarding() && !store.getSetting('syncUid')) location.hash = '#/bienvenida';
}

navigate();
onSyncChange(() => renderNav(parseHash().id));
initSync();

// Encuestas: recibir respuestas en tiempo real y avisar
import('./surveys.js').then((m) => m.initSurveys()).catch(() => {});
import('./views/encuestas.js').then((m) => m.startResponseToasts && m.startResponseToasts()).catch(() => {});

// App instalable y sin conexión
// (no se activa dentro de vistas previas incrustadas)
if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
