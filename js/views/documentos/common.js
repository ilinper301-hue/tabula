// Tabula · Documentos · utilidades compartidas (miniaturas, imprimir, abrir, cola)
import { store } from '../../store.js';
import { h, icon, toast, todayISO, relativeDay, fromISO, toISO } from '../../ui.js';
import { KINDS, kindOf, canPrint, formatSize } from '../../documents.js';
import { getFile, printBlob, openBlob, downloadBlob } from '../../files.js';

export const KIND_ICON = { pdf: 'documentos', imagen: 'image', texto: 'documentos', hoja: 'table', presentacion: 'slides', enlace: 'link', otro: 'documentos' };
export const KIND_SHORT = { pdf: 'PDF', imagen: 'Imagen', texto: 'Texto', hoja: 'Hoja', presentacion: 'Diapos', enlace: 'Enlace', otro: 'Archivo' };

export const docsById = () => Object.fromEntries(store.list('documentos').map((d) => [d.id, d]));
export const getDoc = (id) => store.get('documentos', id);

/** Miniatura del documento (imagen) o un marcador con icono y etiqueta del tipo. */
export function thumb(doc, { label = true, size = 28 } = {}) {
  const kind = kindOf(doc);
  if (doc.miniatura) {
    return h('div', { class: 'dc-thumb has-img' }, h('img', { src: doc.miniatura, alt: '', loading: 'lazy', draggable: 'false' }));
  }
  return h('div', { class: `dc-thumb dc-k-${kind}`, 'aria-hidden': 'true' },
    icon(KIND_ICON[kind], size), label ? h('span', { class: 'dc-thumb-label' }, KIND_SHORT[kind]) : null);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export { plural };

/** "PDF · 3 págs. · 120 KB · hace…" */
export function metaLine(doc) {
  const kind = kindOf(doc);
  const bits = [KINDS[kind].label];
  if (doc.paginas > 1) bits.push(`${doc.paginas} págs.`);
  if (doc.tamano) bits.push(formatSize(doc.tamano));
  const when = doc.createdAt ? relativeDay(toISO(new Date(doc.createdAt))) : '';
  if (when) bits.push(when);
  return bits.join(' · ');
}

/** "22 copias · doble cara · color" */
export function itemSummary(it) {
  return [plural(it.copias || 1, 'copia', 'copias'), it.dobleCara ? 'doble cara' : 'una cara', it.color ? 'color' : 'blanco y negro'].join(' · ');
}

/** Fecha corta para la cola: "Hoy", "Mañana", "Jueves", "3 nov". */
export const dateLabel = (iso) => (iso ? relativeDay(iso) : 'Sin fecha');
export const weekdayLong = (iso) => {
  const s = fromISO(iso).toLocaleDateString('es-ES', { weekday: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ---------- Archivo: obtener, abrir, descargar, imprimir ----------
const mimeOf = (doc, blob) => {
  const k = kindOf(doc);
  if (k === 'pdf') return 'application/pdf';
  if (k === 'imagen') return (blob.type || doc.tipo || '').startsWith('image/') ? (blob.type || doc.tipo) : 'image/png';
  return blob.type || doc.tipo || '';
};

/** Devuelve el Blob del documento (descargándolo de la nube si hace falta) o null con aviso. */
export async function fetchBlob(doc) {
  if (!doc.fileId) { toast('Este documento no tiene archivo'); return null; }
  try {
    const blob = await getFile(doc.fileId, (p) => toast(`Descargando archivo… ${Math.round(p * 100)} %`));
    if (!blob) toast('No se encuentra el archivo en este dispositivo ni en tu cuenta');
    return blob;
  } catch (e) {
    console.warn(e);
    toast('No se pudo obtener el archivo');
    return null;
  }
}

export async function openDoc(doc) {
  if (doc.enlace && !doc.fileId) { window.open(doc.enlace, '_blank', 'noopener'); return; }
  const blob = await fetchBlob(doc);
  if (blob) openBlob(blob, doc.nombreArchivo || doc.titulo);
}

export async function downloadDoc(doc) {
  const blob = await fetchBlob(doc);
  if (blob) downloadBlob(blob, doc.nombreArchivo || doc.titulo);
}

/**
 * Imprime un documento. Devuelve 'printed' | 'opened' | 'unsupported' | null (error).
 * Anota doc.impresoEn cuando se ha lanzado la impresión.
 */
export async function printDoc(doc, { quiet = false } = {}) {
  if (!canPrint(doc)) {
    if (!quiet) toast('Este tipo de archivo no se imprime desde aquí: ábrelo y usa su opción de imprimir');
    return 'unsupported';
  }
  const blob = await fetchBlob(doc);
  if (!blob) return null;
  let res;
  try { res = await printBlob(blob, mimeOf(doc, blob), { titulo: doc.titulo }); }
  catch (e) { console.warn(e); toast('No se pudo imprimir'); return null; }
  if (res === 'printed') store.update('documentos', doc.id, { impresoEn: Date.now() });
  if (res === 'opened' && !quiet) toast('Se ha abierto: usa Compartir → Imprimir');
  return res;
}

// ---------- Cola ----------
export function markPrinted(item) {
  const t = Date.now();
  store.update('impresiones', item.id, { estado: 'impreso', impresoEn: t });
  if (store.get('documentos', item.documentoId)) store.update('documentos', item.documentoId, { impresoEn: t });
}

/** Imprime un elemento de la cola y, si se lanzó la impresión, lo marca como impreso. */
export async function printItem(item, opts) {
  const doc = getDoc(item.documentoId);
  if (!doc) { toast('El documento ya no existe'); return null; }
  if (!canPrint(doc)) { await openDoc(doc); return 'unsupported'; }
  const res = await printDoc(doc, opts);
  if (res === 'printed') {
    store.update('impresiones', item.id, { estado: 'impreso', impresoEn: Date.now() });
    if (!opts?.quiet) toast('Impreso y marcado en la cola');
  }
  return res;
}

export function removeItemWithUndo(item) {
  const removed = store.remove('impresiones', item.id);
  if (removed) toast('Quitado de la cola', { label: 'Deshacer', run: () => store.restore('impresiones', removed) });
}

/** Cambia la URL sin recargar ni disparar la navegación (mantiene #/documentos coherente). */
export function setHash(params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  try { history.replaceState(null, '', `#/documentos${q ? '?' + q : ''}`); } catch {}
}

export { h, icon, toast, todayISO };
