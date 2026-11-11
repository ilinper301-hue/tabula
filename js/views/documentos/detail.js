// Tabula · Documentos · hoja de detalle de un documento
import { store } from '../../store.js';
import { h, icon, openSheet, toast, tagClass, relativeDay, toISO } from '../../ui.js';
import { kindOf, canPrint, KINDS, facets, parseTags, queueItemsOf } from '../../documents.js';
import { deleteFile } from '../../files.js';
import { AREAS, areaShort, getGroups, getGroup } from '../../school.js';
import { openMenu, joinMenuItems } from '../../ui-kit.js';
import { thumb, metaLine, printDoc, openDoc, downloadDoc, getDoc, plural } from './common.js';
import { openScheduleSheet } from './schedule.js';

const debounce = (fn, ms = 450) => {
  let t = null;
  const run = () => { clearTimeout(t); t = setTimeout(() => { t = null; fn(); }, ms); };
  run.flush = () => { if (t) { clearTimeout(t); t = null; fn(); } };
  return run;
};

/**
 * Borra uno o varios documentos (y lo suyo en la cola) con «Deshacer».
 * Los archivos solo se eliminan cuando caduca el aviso.
 */
export function deleteDocsWithUndo(docs, { onDeleted } = {}) {
  const items = queueItemsOf(docs.map((d) => d.id), store.list('impresiones'));
  const removed = docs.map((d) => store.remove('documentos', d.id)).filter(Boolean);
  if (!removed.length) return;
  items.forEach((i) => store.remove('impresiones', i.id));
  let undone = false;
  toast(removed.length === 1 ? `«${removed[0].titulo}» eliminado` : `${plural(removed.length, 'documento eliminado', 'documentos eliminados')}`, {
    label: 'Deshacer',
    run: () => { undone = true; removed.forEach((d) => store.restore('documentos', d)); items.forEach((i) => store.restore('impresiones', i)); },
  });
  setTimeout(() => {
    if (undone) return;
    removed.forEach((d) => { if (d.fileId && !store.get('documentos', d.id)) deleteFile(d.fileId).catch(() => {}); });
  }, 6000);
  onDeleted && onDeleted();
}

/** Borra el documento con «Deshacer». */
export const deleteDocWithUndo = (doc, opts) => deleteDocsWithUndo([doc], opts);

export function openDocDetail(docId, { onClose } = {}) {
  const first = getDoc(docId);
  if (!first) { toast('Ese documento ya no existe'); return null; }
  const kind = kindOf(first);
  const isLink = kind === 'enlace';
  const isCharta = kind === 'charta';
  const printable = canPrint(first);

  // ---------- Vista previa ----------
  const preview = h('button', {
    type: 'button', class: 'dc-preview', 'aria-label': isLink ? 'Abrir enlace' : isCharta ? 'Abrir en Charta' : 'Abrir archivo', onclick: () => openDoc(getDoc(docId) || first),
  }, thumb(first, { size: 44 }));

  // ---------- Título y favorito ----------
  const title = h('input', { class: 'input dc-title-input', type: 'text', value: first.titulo || '', 'aria-label': 'Título', placeholder: 'Título' });
  const fav = h('button', { type: 'button', class: 'icon-btn dc-fav-btn', 'aria-pressed': String(!!first.favorito), 'aria-label': 'Favorito' }, icon('star', 20));
  fav.addEventListener('click', () => {
    const on = !(getDoc(docId)?.favorito);
    store.update('documentos', docId, { favorito: on });
    fav.setAttribute('aria-pressed', String(on));
    fav.title = on ? 'Quitar de favoritos' : 'Marcar como favorito';
  });
  fav.title = first.favorito ? 'Quitar de favoritos' : 'Marcar como favorito';

  // ---------- Campos ----------
  const { carpetas } = facets(store.list('documentos'));
  const listId = 'dc-folders-' + Math.random().toString(36).slice(2, 6);
  const carpeta = h('input', { class: 'input', id: 'dc-f-carpeta', type: 'text', list: listId, value: first.carpeta || '', placeholder: 'Sin carpeta', autocomplete: 'off', maxlength: 40 });
  const datalist = h('datalist', { id: listId }, ...carpetas.map((c) => h('option', { value: c.nombre })));
  const tags = h('input', { class: 'input', id: 'dc-f-tags', type: 'text', value: (first.etiquetas || []).join(', '), placeholder: 'tema 3, repaso, fichas…', autocomplete: 'off' });
  const tagChips = h('div', { class: 'dc-tag-chips', 'aria-live': 'polite' });
  const paintTags = () => tagChips.replaceChildren(...parseTags(tags.value).map((t) => h('span', { class: `chip ${tagClass(t)}` }, t)));
  const groups = getGroups();
  const group = h('select', { class: 'select', id: 'dc-f-group' }, h('option', { value: '' }, 'Cualquiera'),
    ...groups.map((g) => h('option', { value: g.id, selected: g.id === first.groupId }, g.nombre)));
  const area = h('select', { class: 'select', id: 'dc-f-area' }, h('option', { value: '' }, 'Cualquiera'),
    ...AREAS.map((a) => h('option', { value: a, selected: a === first.area }, areaShort(a))));
  const copias = h('input', { class: 'input', id: 'dc-f-copias', type: 'number', min: '1', max: '99', inputmode: 'numeric', value: first.copias || '', placeholder: 'Según grupo' });
  const url = isLink ? h('input', { class: 'input', id: 'dc-f-url', type: 'url', value: first.enlace || '', autocomplete: 'off' }) : null;
  const notas = h('textarea', { class: 'textarea', id: 'dc-f-notas', rows: 3, placeholder: 'Para qué sirve, qué hay que preparar…' });
  notas.value = first.notas || '';

  const saved = h('span', { class: 'dc-saved', role: 'status', 'aria-live': 'polite' });
  let savedT;
  const save = debounce(() => {
    if (!getDoc(docId)) return;
    const patch = {
      titulo: title.value.trim() || first.titulo, carpeta: carpeta.value.trim(), etiquetas: parseTags(tags.value),
      groupId: group.value || null, area: area.value || null, notas: notas.value.trim(),
      copias: Math.round(Number(copias.value)) >= 1 ? Math.min(99, Math.round(Number(copias.value))) : null,
    };
    if (url && url.value.trim()) {
      let u = url.value.trim(); if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
      patch.enlace = u;
    }
    store.update('documentos', docId, patch);
    saved.textContent = 'Guardado'; clearTimeout(savedT); savedT = setTimeout(() => { saved.textContent = ''; }, 1500);
  });
  [title, carpeta, tags, notas, copias, url].filter(Boolean).forEach((el) => el.addEventListener('input', save));
  [group, area].forEach((el) => el.addEventListener('change', save));
  [title, carpeta, tags, notas, copias, url].filter(Boolean).forEach((el) => el.addEventListener('blur', () => save.flush()));
  tags.addEventListener('input', paintTags);
  paintTags();

  const field = (label, id, control, hint) => h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('span', { class: 'dc-hint' }, hint) : null);

  // ---------- Acciones: una principal, «Programar» y el resto en «⋯» ----------
  // Principal según el caso: imprimir aquí, imprimir en Charta (se abre allí), abrir el enlace o abrir el archivo.
  const docNow = () => getDoc(docId) || first;
  const main = isCharta ? { icon: 'printer', label: 'Imprimir', aria: 'Imprimir en Charta (se abre Charta)', run: () => openDoc(docNow()) }
    : isLink ? { icon: 'external', label: 'Abrir enlace', run: () => openDoc(docNow()) }
      : printable ? { icon: 'printer', label: 'Imprimir', run: () => printNow() }
        : { icon: 'external', label: 'Abrir', run: () => openDoc(docNow()) };
  const mainBtn = h('button', { type: 'button', class: 'btn btn-primary dc-main', 'aria-label': main.aria || null, onclick: main.run }, icon(main.icon, 17), main.label);
  async function printNow() {
    mainBtn.disabled = true;
    try { await printDoc(docNow()); } finally { mainBtn.disabled = false; paintInfo(); }
  }
  const queueBtn = h('button', { type: 'button', class: 'btn', 'aria-label': 'Programar impresión', onclick: () => openScheduleSheet({ documentoId: docId }) }, icon('clock', 16), 'Programar');
  const moreItems = () => joinMenuItems([
    // «Abrir» solo cuando no es ya la acción principal
    printable && !isCharta && !isLink ? { icon: 'external', label: 'Abrir', desc: 'Ver el archivo', run: () => openDoc(docNow()) } : null,
    !isLink && !isCharta ? { icon: 'download', label: 'Descargar', run: () => downloadDoc(docNow()) } : null,
    // Copia traída de Drive: el original sigue allí
    !isLink && !isCharta && first.driveId && first.enlace ? { icon: 'drive', label: 'Ver en Drive', href: first.enlace, external: true } : null,
    '-',
    { icon: 'trash', label: 'Eliminar', danger: true, run: () => { save.flush(); deleteDocWithUndo(docNow(), { onDeleted: () => close() }); } },
  ]);
  const moreBtn = h('button', {
    type: 'button', class: 'icon-btn dc-more', 'aria-label': 'Más acciones del documento', title: 'Más acciones', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: () => openMenu(moreBtn, moreItems(), { label: 'Más acciones del documento' }),
  }, icon('mas', 22));

  const info = h('p', { class: 'dc-info' });
  function paintInfo() {
    const d = getDoc(docId);
    if (!d) return;
    const pend = store.list('impresiones').filter((i) => i.documentoId === docId && i.estado !== 'impreso').length;
    info.textContent = [
      d.impresoEn ? `Impreso por última vez: ${relativeDay(toISO(new Date(d.impresoEn))).toLowerCase()}` : null,
      pend ? `${pend} ${pend === 1 ? 'impresión pendiente' : 'impresiones pendientes'} en la cola` : null,
    ].filter(Boolean).join(' · ');
  }
  paintInfo();
  const unsub = store.subscribe('impresiones', paintInfo);

  // ---------- Detalles (plegados): carpeta, etiquetas, grupo, área, copias, notas ----------
  const detailsSum = h('span', { class: 'dc-details-sum' });
  function paintDetailsSum() {
    const g = group.value ? getGroup(group.value) : null;
    const n = parseTags(tags.value).length;
    detailsSum.textContent = [carpeta.value.trim(), n ? plural(n, 'etiqueta', 'etiquetas') : '', g ? g.nombre : '', area.value ? areaShort(area.value) : '']
      .filter(Boolean).join(' · ') || 'Carpeta, etiquetas, grupo, notas…';
  }
  [carpeta, tags].forEach((el) => el.addEventListener('input', paintDetailsSum));
  [group, area].forEach((el) => el.addEventListener('change', paintDetailsSum));
  paintDetailsSum();
  const details = h('details', { class: 'dc-details' },
    h('summary', {}, h('span', { class: 'dc-details-title' }, 'Detalles'), detailsSum, icon('chevronDown', 18, 'dc-details-chev')),
    h('div', { class: 'dc-fields' },
      isLink ? field('Enlace', 'dc-f-url', url) : null,
      field('Carpeta', 'dc-f-carpeta', [carpeta, datalist]),
      field('Etiquetas', 'dc-f-tags', [tags, tagChips], 'Sepáralas con comas.'),
      h('div', { class: 'dc-two' }, field('Grupo', 'dc-f-group', group), field('Área', 'dc-f-area', area)),
      field('Copias por defecto', 'dc-f-copias', copias, 'Si lo dejas vacío, se usa el número de alumnos del grupo.'),
      field('Notas', 'dc-f-notas', notas)));

  const body = h('div', { class: 'dc-detail' },
    preview,
    h('div', { class: 'dc-title-row' }, title, fav),
    h('p', { class: 'dc-meta-line' }, h('span', {}, metaLine(first)), saved),
    h('div', { class: 'dc-detail-actions' }, mainBtn, queueBtn, moreBtn),
    isCharta ? h('p', { class: 'dc-hint dc-noprint' }, 'Las fichas de Charta se imprimen desde Charta: se abrirá allí.') : null,
    !printable && !isLink ? h('p', { class: 'dc-hint dc-noprint' }, `Los archivos de tipo «${KINDS[kind].label}» no se imprimen desde Tabula: ábrelos y usa su propia opción de imprimir. Sí puedes programarlos en la cola como recordatorio.`) : null,
    info,
    details);

  const close = openSheet('Documento', body, { onClose: () => { save.flush(); unsub(); onClose && onClose(); } });
  return close;
}
