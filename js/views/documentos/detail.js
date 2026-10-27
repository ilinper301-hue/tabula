// Tabula · Documentos · hoja de detalle de un documento
import { store } from '../../store.js';
import { h, icon, openSheet, toast, tagClass, relativeDay, toISO } from '../../ui.js';
import { kindOf, canPrint, KINDS, facets, parseTags } from '../../documents.js';
import { deleteFile } from '../../files.js';
import { AREAS, areaShort, getGroups } from '../../school.js';
import { thumb, metaLine, printDoc, openDoc, downloadDoc, getDoc } from './common.js';
import { openScheduleSheet } from './schedule.js';

const debounce = (fn, ms = 450) => {
  let t = null;
  const run = () => { clearTimeout(t); t = setTimeout(() => { t = null; fn(); }, ms); };
  run.flush = () => { if (t) { clearTimeout(t); t = null; fn(); } };
  return run;
};

/** Borra el documento con «Deshacer»: el archivo solo se elimina cuando caduca el aviso. */
export function deleteDocWithUndo(doc, { onDeleted } = {}) {
  const items = store.list('impresiones').filter((i) => i.documentoId === doc.id);
  const removed = store.remove('documentos', doc.id);
  if (!removed) return;
  items.forEach((i) => store.remove('impresiones', i.id));
  let undone = false;
  toast(`«${doc.titulo}» eliminado`, {
    label: 'Deshacer',
    run: () => { undone = true; store.restore('documentos', removed); items.forEach((i) => store.restore('impresiones', i)); },
  });
  setTimeout(() => { if (!undone && !store.get('documentos', doc.id) && doc.fileId) deleteFile(doc.fileId).catch(() => {}); }, 6000);
  onDeleted && onDeleted();
}

export function openDocDetail(docId, { onClose } = {}) {
  const first = getDoc(docId);
  if (!first) { toast('Ese documento ya no existe'); return null; }
  const kind = kindOf(first);
  const isLink = kind === 'enlace';
  const printable = canPrint(first);

  // ---------- Vista previa ----------
  const preview = h('button', {
    type: 'button', class: 'dc-preview', 'aria-label': isLink ? 'Abrir enlace' : 'Abrir archivo', onclick: () => openDoc(getDoc(docId) || first),
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

  // ---------- Acciones ----------
  const printBtn = h('button', {
    type: 'button', class: 'btn btn-primary', disabled: !printable,
    title: printable ? null : 'Este tipo de archivo no se imprime desde aquí',
    onclick: async () => {
      printBtn.disabled = true;
      try { await printDoc(getDoc(docId) || first); } finally { printBtn.disabled = !printable; paintInfo(); }
    },
  }, icon('printer', 16), 'Imprimir ahora');
  const queueBtn = h('button', { type: 'button', class: 'btn', onclick: () => openScheduleSheet({ documentoId: docId }) }, icon('clock', 16), 'Para imprimir…');
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

  const actions = h('div', { class: 'dc-actions' },
    isLink ? null : printBtn, queueBtn,
    h('button', { type: 'button', class: 'btn', onclick: () => openDoc(getDoc(docId) || first) }, icon('external', 16), isLink ? 'Abrir enlace' : 'Abrir'),
    isLink ? null : h('button', { type: 'button', class: 'btn', onclick: () => downloadDoc(getDoc(docId) || first) }, icon('download', 16), 'Descargar'));

  const del = h('button', {
    type: 'button', class: 'btn btn-ghost btn-danger', onclick: () => {
      save.flush();
      deleteDocWithUndo(getDoc(docId) || first, { onDeleted: () => close() });
    },
  }, icon('trash', 16), 'Eliminar');

  const body = h('div', { class: 'dc-detail' },
    preview,
    h('div', { class: 'dc-title-row' }, title, fav),
    h('p', { class: 'dc-meta-line' }, metaLine(first)),
    actions,
    !printable && !isLink ? h('p', { class: 'dc-hint dc-noprint' }, `Los archivos de tipo «${KINDS[kind].label}» no se imprimen desde Tabula: ábrelos y usa su propia opción de imprimir. Sí puedes programarlos en la cola como recordatorio.`) : null,
    info,
    h('div', { class: 'dc-fields' },
      isLink ? field('Enlace', 'dc-f-url', url) : null,
      field('Carpeta', 'dc-f-carpeta', [carpeta, datalist]),
      field('Etiquetas', 'dc-f-tags', [tags, tagChips], 'Sepáralas con comas.'),
      h('div', { class: 'dc-two' }, field('Grupo', 'dc-f-group', group), field('Área', 'dc-f-area', area)),
      field('Copias por defecto', 'dc-f-copias', copias, 'Si lo dejas vacío, se usa el número de alumnos del grupo.'),
      field('Notas', 'dc-f-notas', notas)),
    h('div', { class: 'dc-foot' }, saved, del));

  const close = openSheet('Documento', body, { onClose: () => { save.flush(); unsub(); onClose && onClose(); } });
  return close;
}
