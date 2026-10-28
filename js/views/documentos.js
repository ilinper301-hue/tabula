// Tabula · vista «Documentos»
//
// Rutas:
//   #/documentos                  biblioteca
//   #/documentos?tab=imprimir     cola «Para imprimir»
//   #/documentos?doc=<id>         abre la ficha de un documento
//
// Submódulos en ./documentos/ · estilos en css/documentos.css · modelo puro en js/documents.js
import { store } from '../store.js';
import { h, icon, todayISO } from '../ui.js';
import { dueNow } from '../documents.js';
import { mountLibrary, libState } from './documentos/library.js';
import { mountQueue, liveQueue } from './documentos/queue.js';
import { openDocDetail } from './documentos/detail.js';
import { pickFiles, uploadFiles, openLinkSheet, addFromDrive } from './documentos/upload.js';
import { setHash } from './documentos/common.js';
import { openPasteSheet, importShared } from './documentos/claude.js';

let disposePrev = null; // evita escuchas duplicadas si la vista se pinta dos veces seguidas

export function render(container, params = new URLSearchParams()) {
  if (disposePrev) { try { disposePrev(); } catch {} }
  let tab = params.get('tab') === 'imprimir' ? 'imprimir' : 'biblioteca';
  let mounted = null;
  let dragDepth = 0;

  // ---------- Estado de subida ----------
  const status = h('div', { class: 'dc-upload-status', role: 'status', 'aria-live': 'polite', hidden: true });
  const setStatus = (t) => { status.hidden = !t; status.replaceChildren(...(t ? [h('span', { class: 'dc-spinner', 'aria-hidden': 'true' }), t] : [])); };
  const upload = async (files) => {
    if (!files || !files.length) return;
    if (tab !== 'biblioteca') showTab('biblioteca');
    await uploadFiles(files, { carpeta: libState.carpeta || '' }, setStatus);
  };
  const chooseFiles = async () => upload(await pickFiles());
  const fromDrive = async () => { const c = await addFromDrive({ carpeta: libState.carpeta || '' }, setStatus); if (c.length && tab !== 'biblioteca') showTab('biblioteca'); };
  const addLink = () => openLinkSheet({ carpeta: libState.carpeta || '', onAdded: () => { if (tab !== 'biblioteca') showTab('biblioteca'); } });

  const openDoc = (id) => { setHash({ tab: tab === 'imprimir' ? 'imprimir' : '', doc: id }); openDocDetail(id, { onClose: () => setHash({ tab: tab === 'imprimir' ? 'imprimir' : '' }) }); };

  // ---------- Cabecera y pestañas ----------
  const badge = h('span', { class: 'dc-badge', hidden: true });
  const tabBtn = (id, label, extra) => h('button', {
    type: 'button', role: 'tab', id: `dc-tab-${id}`, 'aria-controls': 'dc-panel', 'aria-selected': String(tab === id), dataset: { tab: id },
    onclick: () => showTab(id),
  }, label, extra);
  const tabs = h('div', { class: 'segmented dc-tabs', role: 'tablist', 'aria-label': 'Secciones de Documentos' },
    tabBtn('biblioteca', 'Biblioteca'), tabBtn('imprimir', 'Para imprimir', badge));
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    showTab(tab === 'biblioteca' ? 'imprimir' : 'biblioteca'); tabs.querySelector('[aria-selected="true"]').focus();
  });
  const panel = h('div', { class: 'dc-panel', id: 'dc-panel', role: 'tabpanel', tabindex: '-1' });

  function paintBadge() {
    const n = dueNow(liveQueue(), todayISO()).length;
    badge.hidden = !n; badge.textContent = String(n);
    badge.setAttribute('aria-label', `${n} para hoy`);
  }

  function showTab(id) {
    tab = id;
    tabs.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    panel.setAttribute('aria-labelledby', `dc-tab-${id}`);
    mounted && mounted.destroy();
    mounted = id === 'imprimir'
      ? mountQueue({ onOpen: openDoc, goLibrary: () => showTab('biblioteca') })
      : mountLibrary({ onOpen: openDoc, upload: chooseFiles, link: addLink });
    panel.replaceChildren(mounted.el);
    setHash({ tab: id === 'imprimir' ? 'imprimir' : '' });
  }

  container.replaceChildren(
    h('header', { class: 'page-head dc-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Fichas, exámenes y recursos'), h('h1', { class: 'page-title' }, 'Documentos')),
      h('div', { class: 'dc-head-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => openPasteSheet({ carpeta: libState.carpeta || '', onSaved: () => { if (tab !== 'biblioteca') showTab('biblioteca'); } }), 'aria-label': 'Pegar de Claude', title: 'Pegar una ficha hecha con Claude' }, icon('sparkle', 16), h('span', { class: 'dc-btn-text' }, 'Pegar de Claude')),
        h('button', { type: 'button', class: 'btn', onclick: fromDrive, 'aria-label': 'Añadir desde Google Drive', title: 'Elegir archivos de tu Google Drive' }, icon('drive', 16), h('span', { class: 'dc-btn-text' }, 'Drive')),
        h('button', { type: 'button', class: 'btn', onclick: addLink, 'aria-label': 'Añadir enlace' }, icon('link', 16), h('span', { class: 'dc-btn-text' }, 'Añadir enlace')),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: chooseFiles }, icon('upload', 16), 'Subir'))),
    tabs, status, panel);

  // ---------- Arrastrar y soltar ----------
  const drop = h('div', { class: 'dc-drop', 'aria-hidden': 'true' },
    h('div', { class: 'dc-drop-card' }, icon('upload', 36), h('strong', {}, 'Suelta los archivos aquí'), h('span', {}, 'Se añadirán a tu biblioteca')));
  document.body.append(drop);
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  const onEnter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; drop.classList.add('show'); };
  const onOver = (e) => { if (hasFiles(e)) e.preventDefault(); };
  const onLeave = (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.classList.remove('show'); };
  const onDrop = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; drop.classList.remove('show');
    upload([...e.dataTransfer.files]);
  };
  // Pegar archivos copiados (p. ej. un PDF copiado en la app Archivos) en cualquier parte de la vista
  const onPaste = (e) => {
    if (document.querySelector('.overlay')) return; // dentro de una hoja abierta decide la hoja
    const files = e.clipboardData ? [...(e.clipboardData.files || [])] : [];
    if (!files.length) return;
    e.preventDefault();
    upload(files);
  };
  window.addEventListener('paste', onPaste);
  window.addEventListener('dragenter', onEnter);
  window.addEventListener('dragover', onOver);
  window.addEventListener('dragleave', onLeave);
  window.addEventListener('drop', onDrop);

  showTab(tab);
  paintBadge();
  const unsubs = ['impresiones', 'documentos'].map((c) => store.subscribe(c, paintBadge));
  if (params.get('doc') && store.get('documentos', params.get('doc'))) openDoc(params.get('doc'));
  // Recibido con «Compartir → Tabula» (Android)
  // (se mira siempre: si la app se cerró a medias, lo pendiente se importa la próxima vez)
  if (params.get('compartido')) setHash({});
  importShared({ upload, carpeta: libState.carpeta || '' });

  const dispose = () => {
    if (disposePrev === dispose) disposePrev = null;
    mounted && mounted.destroy();
    unsubs.forEach((u) => u());
    window.removeEventListener('paste', onPaste);
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((ev, i) => window.removeEventListener(ev, [onEnter, onOver, onLeave, onDrop][i]));
    drop.remove();
  };
  disposePrev = dispose;
  return dispose;
}
