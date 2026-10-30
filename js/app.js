// Tabula · arranque, navegación y estructura

import { store } from './store.js';
import { h, icon, logoLockup } from './ui.js';
import { initSync, getSyncState, onSyncChange, SYNC_LABELS } from './sync.js';
import './plan-sync.js';
import { initLock, setForgotHandler, resetLock } from './lock.js';
import { signOutAndClear } from './sync.js';
import { SECTIONS, AJUSTES, NAV_BLOCKS, APPS_AMIGAS, normalizeMobileNav } from './nav-model.js';
import { openSearch, initSearch, searchHint } from './views/search-ui.js';

// Datos del dispositivo (IndexedDB) cargados antes de pintar nada
await store.ready();

// Módulos de la app. `fase` indica cuándo se construye cada uno.
const ROUTES = [
  { id: 'hoy', label: 'Hoy', icon: 'hoy', load: () => import('./views/hoy.js'), mobile: true },
  { id: 'tareas', label: 'Tareas', icon: 'tareas', load: () => import('./views/tareas.js'), mobile: true, count: true },
  { id: 'documentos', label: 'Documentos', icon: 'documentos', load: () => import('./views/documentos.js') },
  { id: 'calendario', label: 'Calendario', icon: 'calendario', load: () => import('./views/calendario.js'), mobile: true },
  { id: 'grupos', label: 'Grupos', icon: 'grupos', load: () => import('./views/grupos.js'), mobile: true },
  { id: 'aula', label: 'En clase', icon: 'aula', load: () => import('./views/aula.js') },
  { id: 'tutoria', label: 'Tutoría', icon: 'tutoria', load: () => import('./views/tutoria.js') },
  { id: 'cuaderno', label: 'Cuaderno', icon: 'cuaderno', load: () => import('./views/cuaderno.js') },
  { id: 'planificacion', label: 'Planificación', icon: 'planificacion', load: () => import('./views/planificacion.js') },
  { id: 'programas', label: 'Planes y programas', icon: 'programas', load: () => import('./views/programas.js') },
  { id: 'encuestas', label: 'Encuestas', icon: 'encuestas', load: () => import('./views/encuestas.js') },
  { id: 'codigos', label: 'Códigos', icon: 'lock', load: () => import('./views/codigos.js') },
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
  const link = (id) => {
    const r = SECTIONS[id];
    return h('a', {
      class: 'nav-link', href: `#/${id}`, title: r.label,
      'aria-current': id === activeId ? 'page' : null,
    }, icon(r.icon, 19), h('span', { class: 'label' }, r.label),
    r.count && count ? h('span', { class: 'count', 'aria-label': `${count} pendientes` }, String(count)) : null);
  };

  const sync = getSyncState();
  const displayName = profile.nombre || (sync.user && sync.user.name) || '';
  const initials = (displayName || 'Tú').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const sub = sync.enabled ? SYNC_LABELS[sync.status] : (profile.centro || 'Ajustes');

  const blocks = NAV_BLOCKS.map((b) => h('div', { class: 'nav-block', role: 'group', 'aria-labelledby': `navb-${b.id}` },
    h('div', { class: 'nav-label', id: `navb-${b.id}` }, b.label),
    ...b.items.map(link)));
  // Apps amigas: enlaces externos al final del menú
  blocks.push(h('div', { class: 'nav-block', role: 'group', 'aria-labelledby': 'navb-apps' },
    h('div', { class: 'nav-label', id: 'navb-apps' }, 'Apps amigas'),
    ...APPS_AMIGAS.map((a) => h('a', { class: 'nav-link nav-app', href: a.url, target: '_blank', rel: 'noopener', title: `${a.nombre}: ${a.desc}` },
      h('img', { class: 'nav-app-ico', src: a.icono, alt: '', width: 19, height: 19 }), h('span', { class: 'label' }, a.nombre),
      h('span', { class: 'label nav-app-ext', 'aria-hidden': 'true' }, icon('external', 13))))));

  sidebar.replaceChildren(
    h('a', { class: 'brand', href: '#/hoy', 'aria-label': 'Tabula, ir a Hoy' }, logoLockup({ size: 34 })),
    h('button', { type: 'button', class: 'side-search', title: 'Buscar', 'aria-label': 'Buscar', 'aria-haspopup': 'dialog', onclick: (e) => openSearch({ from: e.currentTarget }) },
      icon('search', 17), h('span', { class: 'label' }, 'Buscar…'), h('kbd', { class: 'label' }, searchHint())),
    h('div', { class: 'side-scroll' }, ...blocks),
    h('div', { class: 'side-foot' },
      h('a', {
        class: 'nav-link', href: '#/ajustes', title: AJUSTES.label,
        'aria-current': activeId === 'ajustes' ? 'page' : null,
      },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials),
      h('span', { class: 'label user-label' },
        h('span', { class: 'user-name' }, displayName || 'Mi perfil'),
        h('span', { class: `user-sub sync-${sync.status}` }, sub)))),
  );

  const mobileBrand = document.getElementById('mobile-brand');
  if (mobileBrand && !mobileBrand.firstChild) {
    mobileBrand.append(
      h('a', { href: '#/hoy', class: 'brand', 'aria-label': 'Tabula, ir a Hoy' }, logoLockup({ size: 30 })),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Buscar', 'aria-haspopup': 'dialog', onclick: (e) => openSearch({ from: e.currentTarget }) }, icon('search', 22)));
  }
  // En el móvil, el logotipo encabeza la pantalla principal (Hoy)
  if (mobileBrand) mobileBrand.hidden = activeId !== 'hoy';

  const mob = normalizeMobileNav(store.getSetting('navMovil', null));
  const moreActive = !mob.includes(activeId);
  bottomNav.replaceChildren(
    ...mob.map((id) => {
      const r = SECTIONS[id];
      return h('a', { href: `#/${id}`, 'aria-current': id === activeId ? 'page' : null },
        h('span', { class: 'bn-icon' }, icon(r.icon, 22),
          r.count && count ? h('span', { class: 'bn-badge', 'aria-label': `${count} pendientes` }, count > 99 ? '99+' : String(count)) : null),
        r.label);
    }),
    h('a', { href: '#/mas', 'aria-current': moreActive ? 'page' : null }, h('span', { class: 'bn-icon' }, icon('mas', 22)), 'Más'),
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
  // Guía rápida (si está activada)
  import('./guide.js').then((g) => { if (parseHash().id === id) g.mountGuide(id, viewEl, params); }).catch(() => {});
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
      h('button', { class: 'btn btn-danger', style: { marginTop: '10px' }, onclick: async () => {
        if (input.value.trim().toUpperCase() !== 'BORRAR') { input.focus(); return; }
        resetLock(); await store._clearLocal(); location.reload();
      } }, 'Borrar datos de este dispositivo'));
  }
  card.append(box);
});
initLock();

// Sin sesión en este dispositivo: lo primero es la pantalla de entrada (iniciar sesión o seguir sin cuenta)
const entrada = await import('./views/entrada.js');
if (entrada.needsEntrada()) entrada.showEntrada();
// Primer uso: asistente (nunca para quien ya tiene datos o enlazó una cuenta en este dispositivo)
else if (!location.hash || location.hash === '#/' || location.hash === '#/hoy') {
  const { needsOnboarding } = await import('./views/bienvenida.js');
  if (needsOnboarding() && !store.getSetting('syncUid')) location.hash = '#/bienvenida';
}

initSearch();
navigate();

// Atajos del icono de la app (manifest «shortcuts»): ?accion=dictar | tarea | lista
const accion = new URLSearchParams(location.search).get('accion');
if (accion) {
  history.replaceState(null, '', location.pathname + location.hash);
  if (accion === 'dictar') import('./views/voz.js').then((m) => m.openVoz()).catch(() => {});
  else if (accion === 'tarea') {
    let n = 0;
    const t = setInterval(() => { const el = document.getElementById('tareas-quick'); if (el || ++n > 30) { clearInterval(t); el?.focus(); } }, 100);
  } else if (accion === 'lista') {
    import('./views/aula/common.js').then((m) => {
      const id = m.defaultGroupId();
      if (id) location.hash = `#/grupos?${new URLSearchParams({ id, tab: 'asistencia' })}`;
    }).catch(() => {});
  }
}
onSyncChange(() => renderNav(parseHash().id));
initSync();

// Acceso de asistente (solo hace algo si se ha activado en Ajustes)
import('./asistente.js').then((m) => m.initAssistant()).catch(() => {});

// Recordatorio de copia de seguridad: sin cuenta conectada y más de 30 días sin copia (como mucho, una vez por semana)
const backupReminder = async (intento = 0) => {
  try {
    if (store.getSetting('syncUid') || !store._hasLocalData()) return;
    // No pisar otro aviso (p. ej. un «Deshacer»): se espera a que no haya ninguno visible
    if (document.querySelector('#toast.show') || document.querySelector('.overlay') || document.body.classList.contains('has-entrada')) { if (intento < 10) setTimeout(() => backupReminder(intento + 1), 8000); return; }
    const { daysSinceBackup } = await import('./backup.js');
    const d = daysSinceBackup();
    const last = store.getSetting('backup:aviso', 0);
    if ((d === null || d > 30) && Date.now() - last > 7 * 86400000) {
      store.setSetting('backup:aviso', Date.now());
      const { toast } = await import('./ui.js');
      toast(d === null ? 'Aún no tienes copia de seguridad de tus datos' : `Tu última copia es de hace ${d} días`, { label: 'Hacer copia', run: () => { location.hash = '#/ajustes'; } });
    }
  } catch {}
};
setTimeout(backupReminder, 6000);

// Encuestas: recibir respuestas en tiempo real y avisar
import('./surveys.js').then((m) => m.initSurveys()).catch(() => {});
import('./views/encuestas.js').then((m) => m.startResponseToasts && m.startResponseToasts()).catch(() => {});

// App instalable y sin conexión
// (no se activa dentro de vistas previas incrustadas)
if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
