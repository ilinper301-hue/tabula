// Tabula · Documentos · subir archivos y añadir enlaces
import { store } from '../../store.js';
import { h, icon, openSheet, toast } from '../../ui.js';
import { saveFile, makeThumbnail, MAX_FILE_MB } from '../../files.js';
import { titleFromFilename } from '../../documents.js';
import { plural } from './common.js';

export const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,application/pdf,image/*';

/**
 * Guarda archivos como documentos nuevos, uno a uno.
 * @param opts { carpeta, etiquetas, groupId, area }
 * @param onStatus (texto|null) para mostrar el avance
 * @returns documentos creados
 */
export async function uploadFiles(files, opts = {}, onStatus = () => {}) {
  const list = [...files];
  const created = [], failed = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    onStatus(list.length > 1 ? `Subiendo ${i + 1} de ${list.length}: ${file.name}` : `Subiendo ${file.name}…`);
    try {
      if (!file.size) throw new Error('El archivo está vacío');
      if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`pesa más de ${MAX_FILE_MB} MB`);
      const saved = await saveFile(file);
      const th = await makeThumbnail(file, saved.tipo);
      const doc = store.add('documentos', {
        titulo: titleFromFilename(saved.nombre), fileId: saved.fileId, nombreArchivo: saved.nombre,
        tipo: saved.tipo, tamano: saved.tamano, paginas: th.paginas || null, miniatura: th.miniatura || null,
        carpeta: opts.carpeta || '', etiquetas: opts.etiquetas || [], notas: '', favorito: false,
        ...(opts.groupId ? { groupId: opts.groupId } : {}), ...(opts.area ? { area: opts.area } : {}),
      });
      created.push(doc);
    } catch (e) {
      console.warn('Tabula: no se pudo subir', file.name, e);
      failed.push(`${file.name} (${e.message || 'error'})`);
    }
  }
  onStatus(null);
  if (failed.length) {
    toast(created.length
      ? `${plural(created.length, 'documento añadido', 'documentos añadidos')}. No se pudo: ${failed[0]}${failed.length > 1 ? ` y ${failed.length - 1} más` : ''}`
      : `No se pudo subir: ${failed[0]}${failed.length > 1 ? ` y ${failed.length - 1} más` : ''}`);
  } else if (created.length) {
    toast(created.length === 1 ? `«${created[0].titulo}» añadido` : `${created.length} documentos añadidos`);
  }
  return created;
}

/** Abre el selector de archivos del sistema y devuelve los elegidos. */
export function pickFiles({ multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: ACCEPT, multiple, hidden: true });
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

/** Hoja «Añadir enlace» (Drive, web…). onAdded(doc) al guardar. */
export function openLinkSheet({ carpeta = '', onAdded } = {}) {
  const url = h('input', { class: 'input', id: 'dc-link-url', type: 'url', inputmode: 'url', placeholder: 'https://drive.google.com/…', autocomplete: 'off' });
  const title = h('input', { class: 'input', id: 'dc-link-title', type: 'text', placeholder: 'Nombre del documento', autocomplete: 'off' });
  const err = h('p', { class: 'dc-error', role: 'alert' });
  const save = () => {
    let u = url.value.trim();
    if (!u) { err.textContent = 'Pega la dirección del enlace.'; url.focus(); return; }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    let parsed;
    try { parsed = new URL(u); if (!/^https?:$/.test(parsed.protocol)) throw 0; } catch { err.textContent = 'Esa dirección no parece válida.'; url.focus(); return; }
    const doc = store.add('documentos', {
      titulo: title.value.trim() || parsed.hostname.replace(/^www\./, ''), enlace: parsed.href, nombreArchivo: '', tipo: '', tamano: 0,
      carpeta, etiquetas: [], notas: '', favorito: false,
    });
    close();
    toast(`«${doc.titulo}» añadido`);
    onAdded && onAdded(doc);
  };
  [url, title].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }));
  const body = h('div', { class: 'dc-sheet-form' },
    h('p', { class: 'dc-hint' }, 'Para documentos de Drive, la web o cualquier sitio. Se abre en una pestaña nueva.'),
    h('div', { class: 'field' }, h('label', { for: 'dc-link-url' }, 'Dirección'), url),
    h('div', { class: 'field' }, h('label', { for: 'dc-link-title' }, 'Título (opcional)'), title),
    err,
    h('div', { class: 'dc-actions end' },
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, icon('link', 16), 'Añadir enlace')));
  const close = openSheet('Añadir enlace', body);
  return close;
}
