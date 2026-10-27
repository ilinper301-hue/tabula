// Tabula · service worker: permite abrir la app sin conexión.
// Estrategia: red primero para archivos propios (siempre la última versión), caché si no hay red.
const CACHE = 'tabula-v11';
const CORE = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './css/tareas.css', './css/calendario.css', './css/grupos.css', './css/cuaderno.css', './css/planificacion.css', './css/bienvenida.css', './css/anecdotario.css', './css/programas.css', './css/encuestas.css', './css/encuesta-public.css',
  './js/app.js', './js/store.js', './js/ui.js', './js/tasks-model.js', './js/school.js', './js/grading.js', './js/planning.js', './js/plan-sync.js', './js/observations.js', './js/lock.js', './js/timetable.js', './js/programs.js', './js/surveys.js', './js/sync.js', './js/firebase-config.js',
  './js/views/hoy.js', './js/views/tareas.js', './js/views/ajustes.js', './js/views/calendario.js', './js/views/grupos.js', './js/views/cuaderno.js', './js/views/planificacion.js', './js/views/mas.js', './js/views/bienvenida.js', './js/views/anecdotario.js', './js/views/programas.js', './js/views/encuestas.js', './encuesta.html', './js/encuesta-public.js', './icons/icon.svg', './icons/icon-192.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './js/views/anecdotario/common.js', './js/views/anecdotario/group-tab.js', './js/views/anecdotario/list.js', './js/views/anecdotario/quick.js', './js/views/bienvenida/common.js', './js/views/bienvenida/final.js', './js/views/bienvenida/step-alumnado.js', './js/views/bienvenida/step-grupo.js', './js/views/bienvenida/step-horario.js', './js/views/bienvenida/step-perfil.js', './js/views/cuaderno/common.js', './js/views/cuaderno/export.js', './js/views/cuaderno/grid.js', './js/views/cuaderno/model.js', './js/views/cuaderno/panel.js', './js/views/cuaderno/sheet-activity.js', './js/views/cuaderno/sheet-config.js', './js/views/cuaderno/sheet-student.js', './js/views/encuestas/common.js', './js/views/encuestas/editor.js', './js/views/encuestas/list.js', './js/views/encuestas/model.js', './js/views/encuestas/preview.js', './js/views/encuestas/question-card.js', './js/views/encuestas/tab-compartir.js', './js/views/encuestas/tab-editar.js', './js/views/encuestas/tab-resultados.js', './js/views/encuestas/templates.js', './js/views/grupos/alumnado.js', './js/views/grupos/asistencia.js', './js/views/grupos/common.js', './js/views/grupos/parse-students.js', './js/views/grupos/resumen.js', './js/views/grupos/sheets.js', './js/views/grupos/summary.js', './js/views/planificacion/detail.js', './js/views/planificacion/model.js', './js/views/planificacion/overview.js', './js/views/planificacion/session-sheet.js', './js/views/planificacion/sheets.js', './js/views/planificacion/timeline.js', './js/views/programas/common.js', './js/views/programas/diario.js', './js/views/programas/equipo.js', './js/views/programas/listeditor.js', './js/views/programas/memoria.js', './js/views/programas/objetivos.js', './js/views/programas/quick.js', './js/views/programas/sheet.js', './js/views/programas/tareas.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fuentes y SDK de Firebase (versionado, no cambia): caché primero, para abrir sin conexión
  const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')
    || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'));
  if (url.origin !== location.origin && !isFont) return;

  if (isFont) {
    // Fuentes: caché primero
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))));
});
