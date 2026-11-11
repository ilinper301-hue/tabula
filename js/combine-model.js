// Tabula · «Imprimir juntos»: lógica pura (sin DOM), probada con Node.
// Une varios documentos (PDF, imágenes y fichas HTML) en un único trabajo de impresión,
// p. ej. para sacar una ficha por delante y otra por detrás del mismo folio.
import { kindOf } from './documents.js';

/** Tipos que se pueden combinar. Las fichas de Charta se imprimen desde Charta. */
export const COMBINABLE = ['pdf', 'imagen', 'ficha'];
export const canCombine = (doc) => !!doc && !doc.charta && COMBINABLE.includes(kindOf(doc));

/** Mueve el elemento `i` una posición (`dir` = -1 arriba, +1 abajo). Devuelve una lista nueva. */
export function move(list, i, dir) {
  const j = i + dir;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list.slice();
  const out = list.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/**
 * Páginas en blanco que hay que añadir detrás de cada documento.
 * Con `nuevaHoja`, si un documento acaba en el anverso (número impar de páginas) se añade una
 * página en blanco para que el siguiente empiece en una hoja nueva al imprimir a doble cara.
 * Al último nunca se le añade.
 */
export function blanksAfter(pages, { nuevaHoja = false } = {}) {
  return pages.map((p, i) => (nuevaHoja && i < pages.length - 1 && (Math.max(1, Number(p) || 1) % 2 === 1) ? 1 : 0));
}

/** Resumen: páginas totales (con blancos) y hojas a doble cara / a una cara. */
export function combineSummary(pages, opts = {}) {
  const blanks = blanksAfter(pages, opts);
  const total = pages.reduce((s, p, i) => s + Math.max(1, Number(p) || 1) + blanks[i], 0);
  return { paginas: total, blancas: blanks.reduce((a, b) => a + b, 0), hojasDobleCara: Math.ceil(total / 2), hojasUnaCara: total };
}

/**
 * Adapta el CSS de una ficha para que funcione dentro de un shadow root:
 * `html` → `:host`, `body` → `.tb-body`, y se quitan las reglas @page (las pone la hoja combinada).
 */
export function scopeFichaCss(css) {
  return String(css || '')
    .replace(/@page[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/gi, '')
    .replace(/(^|[\s,{}>+~(])(html|body)(?=[\s,{.:#[>+~)]|$)/gi, (m, pre, tag) => pre + (tag.toLowerCase() === 'html' ? ':host' : '.tb-body'));
}

/** Páginas aproximadas de una ficha HTML a partir de su altura en px (A4 a 96 ppp con márgenes de 14 mm). */
export const FICHA_PAGE_PX = 1123 - 2 * 53;
export const fichaPagesFromHeight = (px) => Math.max(1, Math.ceil((Number(px) || 0) / FICHA_PAGE_PX - 0.02));
