// Tabula · service worker: permite abrir la app sin conexión.
// Estrategia: red primero para archivos propios (siempre la última versión), caché si no hay red.
const CACHE = 'tabula-v29';
const CORE = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './css/tareas.css', './css/calendario.css', './css/grupos.css', './css/cuaderno.css', './css/planificacion.css', './css/bienvenida.css', './css/anecdotario.css', './css/programas.css', './css/encuestas.css', './css/encuesta-public.css', './css/documentos.css',
  './js/app.js', './js/store.js', './js/ui.js', './js/tasks-model.js', './js/school.js', './js/grading.js', './js/planning.js', './js/plan-sync.js', './js/observations.js', './js/lock.js', './js/timetable.js', './js/programs.js', './js/surveys.js', './js/sync.js', './js/files.js', './js/documents.js', './js/firebase-config.js', './js/curriculo.js', './js/data/criterios-andalucia.js',
  './js/views/hoy.js', './js/views/tareas.js', './js/views/ajustes.js', './js/views/calendario.js', './js/views/grupos.js', './js/views/cuaderno.js', './js/views/planificacion.js', './js/views/mas.js', './js/views/bienvenida.js', './js/views/anecdotario.js', './js/views/programas.js', './js/views/encuestas.js', './js/views/documentos.js', './encuesta.html', './js/encuesta-public.js', './icons/icon.svg', './icons/icon-192.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './js/views/anecdotario/common.js', './js/views/anecdotario/group-tab.js', './js/views/anecdotario/list.js', './js/views/anecdotario/quick.js', './js/views/bienvenida/common.js', './js/views/bienvenida/final.js', './js/views/bienvenida/step-alumnado.js', './js/views/bienvenida/step-grupo.js', './js/views/bienvenida/step-horario.js', './js/views/bienvenida/step-perfil.js', './js/views/cuaderno/common.js', './js/views/cuaderno/export.js', './js/views/cuaderno/grid.js', './js/views/cuaderno/model.js', './js/views/cuaderno/panel.js', './js/views/cuaderno/sheet-activity.js', './js/views/cuaderno/sheet-config.js', './js/views/cuaderno/sheet-student.js', './js/views/documentos/common.js', './js/views/documentos/library.js', './js/views/documentos/queue.js', './js/views/documentos/detail.js', './js/views/documentos/schedule.js', './js/views/documentos/upload.js', './js/views/documentos/picker.js', './js/views/documentos/attach.js', './js/views/encuestas/common.js', './js/views/encuestas/editor.js', './js/views/encuestas/list.js', './js/views/encuestas/model.js', './js/views/encuestas/preview.js', './js/views/encuestas/question-card.js', './js/views/encuestas/tab-compartir.js', './js/views/encuestas/tab-editar.js', './js/views/encuestas/tab-resultados.js', './js/views/encuestas/templates.js', './js/views/grupos/alumnado.js', './js/views/grupos/asistencia.js', './js/views/grupos/common.js', './js/views/grupos/parse-students.js', './js/views/grupos/resumen.js', './js/views/grupos/sheets.js', './js/views/grupos/summary.js', './js/views/planificacion/detail.js', './js/views/planificacion/model.js', './js/views/planificacion/overview.js', './js/views/planificacion/session-sheet.js', './js/views/planificacion/sheets.js', './js/views/planificacion/timeline.js', './js/views/programas/common.js', './js/views/programas/diario.js', './js/views/programas/equipo.js', './js/views/programas/listeditor.js', './js/views/programas/memoria.js', './js/views/programas/objetivos.js', './js/views/programas/quick.js', './js/views/programas/sheet.js', './js/views/programas/tareas.js',
  './css/aula.css', './css/tutoria.css', './js/calendario-escolar.js', './js/competencias.js', './js/informes.js', './js/quick-eval.js', './js/tutoria.js', './js/views/ajustes/calendario-escolar.js', './js/views/ajustes/nuevo-curso.js', './js/views/aula.js', './js/fichas.js', './js/views/documentos/claude.js', './js/views/aula/azar.js', './js/views/aula/common.js', './js/views/aula/equipos.js', './js/views/aula/evaluar-tab.js', './js/views/aula/evaluar.js', './js/views/aula/responsables.js', './js/views/aula/semaforo.js', './js/views/aula/timer.js', './js/views/cuaderno/informes-common.js', './js/views/cuaderno/informes-data.js', './js/views/cuaderno/informes-familias.js', './js/views/cuaderno/informes-perfil.js', './js/views/cuaderno/informes-print.js', './js/views/cuaderno/informes-seneca.js', './js/views/cuaderno/informes.js', './js/views/tutoria.js', './js/views/tutoria/acta.js', './js/views/tutoria/common.js', './js/views/tutoria/data.js', './js/views/tutoria/diversidad.js', './js/views/tutoria/familias.js', './js/views/tutoria/ficha.js', './js/views/tutoria/grupos-section.js', './js/views/tutoria/medida-sheet.js', './js/views/tutoria/reunion-sheet.js', './js/views/tutoria/reuniones.js',
  './css/extra.css', './js/backup.js', './js/guide.js', './js/nav-model.js', './js/search.js', './js/sustituto.js', './js/views/ajustes/demo.js', './js/views/ajustes/guia.js', './js/views/ajustes/menu.js', './js/views/search-ui.js', './js/views/sustituto.js',
  './js/views/planificacion/prog-model.js', './js/views/planificacion/prog-print.js', './js/views/planificacion/prog-sheet.js', './js/views/planificacion/programacion.js',
  './asistente.html', './css/asistente.css', './js/asistente-client.js', './js/asistente-mark.js', './js/asistente-model.js', './js/asistente-page.js', './js/asistente.js', './js/views/ajustes/asistente.js', './js/views/bandeja.js', './js/voz-model.js', './js/views/voz.js', './js/drive.js', './js/views/entrada.js', './js/views/codigos.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tabula-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// «Compartir → Tabula» (Android): se guarda lo recibido en IndexedDB y se abre Documentos para importarlo
function saveShared(items) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('tabula-files', 2);
    open.onupgradeneeded = () => {
      const db = open.result;
      ['blobs', 'pending'].forEach((n) => { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n); });
      if (!db.objectStoreNames.contains('shared')) db.createObjectStore('shared', { autoIncrement: true });
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const t = open.result.transaction('shared', 'readwrite');
      items.forEach((it) => t.objectStore('shared').add(it));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    };
  });
}
async function handleShare(req) {
  try {
    const form = await req.formData();
    const items = form.getAll('files').filter((f) => f && f.size).map((file) => ({ file }));
    const title = form.get('title') || '', text = form.get('text') || '', url = form.get('url') || '';
    if (title || text || url) items.push({ title, text, url });
    if (items.length) await saveShared(items);
  } catch (e) { /* si falla, se abre Documentos igualmente */ }
  return Response.redirect('./#/documentos?compartido=1', 303);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) { e.respondWith(handleShare(req)); return; }
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
