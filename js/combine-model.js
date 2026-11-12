// Tabula · «Imprimir juntos»: lógica pura (sin DOM), probada con Node.
// Une varios documentos (PDF, imágenes y fichas HTML) en un único trabajo de impresión,
// p. ej. para sacar una ficha por delante y otra por detrás del mismo folio.
import { kindOf, canPrint } from './documents.js';

/** Tipos que se pueden combinar. Las fichas de Charta, si guardan su composición (se dibujan con el motor de Charta). */
export const COMBINABLE = ['pdf', 'imagen', 'ficha'];
export const isChartaComb = (doc) => !!doc && !!doc.charta && !!doc.charta.comp && Array.isArray(doc.charta.comp.actividades);
export const canCombine = (doc) => !!doc && (doc.charta ? isChartaComb(doc) : COMBINABLE.includes(kindOf(doc)));

/** Páginas de una ficha de Charta (una variante): `comp.paginas` = [2, 1, …] actividades por página, o una sola. */
export const chartaPages = (doc) => {
  const c = doc && doc.charta && doc.charta.comp;
  return Math.max(1, Array.isArray(c && c.paginas) ? c.paginas.length : 1);
};

/**
 * Composición guardada de Charta → lo que necesita `Charta.generar(opciones, semilla)` y `Charta.hojas(ficha, {bn})`.
 * Sin nombres de alumnos y con una sola variante. Devuelve null si la composición no sirve.
 */
export function chartaOpciones(comp) {
  if (!comp || !Array.isArray(comp.actividades) || !comp.actividades.length) return null;
  // «Mis frases» van una sola vez en la composición (Charta, fase 1); generar() las lee en cada actividad
  // (las que no usan frases las descarta). Las composiciones antiguas ya las traen en cada actividad.
  const frases = Array.isArray(comp.misFrases) && comp.misFrases.length ? comp.misFrases : null;
  const acts = frases ? comp.actividades.map((a) => ({ ...a, params: { ...(a && a.params), misFrases: frases } })) : comp.actividades;
  const cuentas = Array.isArray(comp.paginas) && comp.paginas.length && comp.paginas.reduce((a, b) => a + (Number(b) || 0), 0) === acts.length
    ? comp.paginas.map((n) => Number(n)) : [acts.length];
  let i = 0;
  const paginas = cuentas.map((n) => { const p = { actividades: acts.slice(i, i + n) }; i += n; return p; });
  const bn = !!comp.bn;
  const semilla = Number.isInteger(comp.semilla) ? comp.semilla : 1;
  return {
    semilla, bn,
    opciones: {
      paginas, variantes: 1,
      ...(comp.titulo ? { titulo: String(comp.titulo) } : {}),
      presentacion: { color: !bn, ...(comp.fuente && comp.fuente !== 'andika' ? { fuente: comp.fuente } : {}), ...(comp.grande ? { letraGrande: true } : {}), ...(comp.facil ? { lecturaFacil: true } : {}) },
    },
  };
}

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

/**
 * «Imprimir lo de hoy»: qué hacer con los elementos de la cola para hoy (y atrasados).
 *   - 'none'   nada se imprime desde Tabula (enlaces, Word…, fichas de Charta sin composición)
 *   - 'direct' se imprime directamente, uno a uno (solo hay un documento distinto)
 *   - 'choose' hay más de un documento combinable: preguntar «Uno a uno» o «Todo junto»
 * @returns { mode, items (imprimibles), docIds (combinables, sin repetir), charta (n.º de fichas de Charta) }
 */
export function printTodayPlan(due, docsById) {
  const items = due.filter((i) => { const d = docsById[i.documentoId]; return d && !d.charta && canPrint(d); });
  // Combinables: los de `items` y las fichas de Charta con composición (solo se imprimen «todo junto»)
  const docIds = [...new Set(due.filter((i) => canCombine(docsById[i.documentoId])).map((i) => i.documentoId))];
  const charta = due.filter((i) => { const d = docsById[i.documentoId]; return d && d.charta && !isChartaComb(d); }).length;
  const mode = docIds.length > 1 ? 'choose' : items.length ? 'direct' : 'none';
  return { mode, items, docIds, charta };
}
