// Tabula · Documentos · «Imprimir juntos»: varios documentos en un solo trabajo de impresión.
// Sirve, por ejemplo, para sacar una ficha por delante y otra por detrás del mismo folio
// (se elige «Doble cara» en la ventana de impresión del sistema).
//
// Cómo se combinan (todo en el dispositivo, sin subir nada):
//   - PDF: cada página se dibuja como imagen a ~200 ppp con pdf.js (el mismo lector de las miniaturas).
//   - Imagen: una página A4.
//   - Ficha HTML: se mete en un shadow root para que sus estilos no se mezclen con los de las demás.
// Lógica pura (orden, páginas en blanco, CSS) en js/combine-model.js.
import { store } from '../../store.js';
import { h, icon, openSheet, toast } from '../../ui.js';
import { kindOf } from '../../documents.js';
import { loadPdfJs } from '../../files.js';
import { sanitizeHtml } from '../../fichas.js';
import { canCombine, move, combineSummary, blanksAfter, scopeFichaCss, fichaPagesFromHeight } from '../../combine-model.js';
import { thumb, fetchBlob, getDoc, plural } from './common.js';

const PDF_PX = 1654; // ancho de cada página de PDF (A4 a 200 ppp)
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/**
 * Abre la hoja «Imprimir juntos».
 * @param ids documentos en el orden inicial
 * @param onPrinted (ids) => void cuando se lanza la impresión (p. ej. la cola pregunta si marcarlos)
 */
export function openCombineSheet(ids, { onPrinted } = {}) {
  let order = ids.filter((id) => canCombine(getDoc(id)));
  const skipped = ids.length - order.length;
  let nuevaHoja = false;
  let busy = false;

  const list = h('ol', { class: 'dc-cb-list' });
  const summary = h('p', { class: 'dc-cb-sum', 'aria-live': 'polite' });
  const sw = h('input', { type: 'checkbox', class: 'switch', 'aria-label': 'Cada documento en una hoja nueva' });
  sw.addEventListener('change', () => { nuevaHoja = sw.checked; paint(); });
  const printBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go() }, icon('printer', 16), 'Imprimir juntos');

  const pagesOf = (d) => (kindOf(d) === 'imagen' ? 1 : Math.max(1, Number(d.paginas) || 1));

  function paint() {
    const docs = order.map(getDoc).filter(Boolean);
    list.replaceChildren(...docs.map((d, i) => h('li', { class: 'dc-cb-row' },
      h('span', { class: 'dc-cb-n', 'aria-hidden': 'true' }, String(i + 1)),
      h('span', { class: 'dc-cb-thumb' }, thumb(d, { label: false, size: 18 })),
      h('span', { class: 'dc-cb-main' },
        h('span', { class: 'dc-cb-title' }, d.titulo || 'Sin título'),
        h('span', { class: 'dc-cb-sub' }, sideLabel(docs, i))),
      h('span', { class: 'dc-cb-tools' },
        h('button', { type: 'button', class: 'icon-btn', disabled: i === 0, 'aria-label': `Subir «${d.titulo}»`, title: 'Subir', onclick: () => { order = move(order, i, -1); paint(); } }, icon('chevronUp', 18)),
        h('button', { type: 'button', class: 'icon-btn', disabled: i === docs.length - 1, 'aria-label': `Bajar «${d.titulo}»`, title: 'Bajar', onclick: () => { order = move(order, i, 1); paint(); } }, icon('chevronDown', 18)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Quitar «${d.titulo}»`, title: 'Quitar', onclick: () => { order = order.filter((x) => x !== d.id); paint(); } }, icon('x', 18))))));
    const s = combineSummary(docs.map(pagesOf), { nuevaHoja });
    summary.textContent = docs.length
      ? `${plural(docs.length, 'documento', 'documentos')} · ${plural(s.paginas, 'página', 'páginas')}${s.blancas ? ` (${plural(s.blancas, 'en blanco', 'en blanco')})` : ''} · ${plural(s.hojasDobleCara, 'hoja', 'hojas')} a doble cara por copia`
      : 'No queda ningún documento.';
    printBtn.disabled = busy || docs.length < 1;
  }

  // «Cara A de la hoja 1», «Cara B de la hoja 1»… según lo que ocupa cada uno antes
  function sideLabel(docs, i) {
    const pages = docs.map(pagesOf);
    const blanks = blanksAfter(pages, { nuevaHoja });
    let start = 0;
    for (let k = 0; k < i; k++) start += pages[k] + blanks[k];
    const p = pages[i];
    const where = (n) => `hoja ${Math.floor(n / 2) + 1}, ${n % 2 ? 'detrás' : 'delante'}`;
    return p === 1 ? `1 página · ${where(start)}` : `${p} páginas · empieza en ${where(start)}`;
  }

  async function go() {
    if (busy) return;
    const docs = order.map(getDoc).filter(Boolean);
    if (!docs.length) return;
    busy = true; printBtn.replaceChildren(h('span', { class: 'dc-spinner', 'aria-hidden': 'true' }), 'Preparando…'); paint();
    try {
      const res = await printCombined(docs, { nuevaHoja });
      if (res === 'printed') {
        const t = Date.now();
        docs.forEach((d) => store.update('documentos', d.id, { impresoEn: t }));
        onPrinted && onPrinted(docs.map((d) => d.id));
        close();
      }
    } catch (e) {
      console.warn(e);
      toast(e?.message || 'No se pudieron combinar los documentos');
    } finally {
      busy = false; printBtn.replaceChildren(icon('printer', 16), 'Imprimir juntos'); paint();
    }
  }

  const body = h('div', { class: 'dc-cb' },
    h('p', { class: 'dc-hint dc-cb-lead' }, 'Se imprimen en un solo trabajo, en este orden. Para que uno salga por delante y otro por detrás, elige «Doble cara» (o «Imprimir en ambas caras») en la ventana de impresión.'),
    skipped ? h('p', { class: 'dc-hint dc-cb-warn' }, `${plural(skipped, 'documento no se puede', 'documentos no se pueden')} combinar (solo PDF, imágenes y fichas; las de Charta se imprimen desde Charta).`) : null,
    list,
    h('label', { class: 'switch-row dc-switch-row' },
      h('span', {}, h('strong', { class: 'dc-sw-label' }, 'Cada documento en una hoja nueva'),
        h('small', { class: 'dc-hint' }, 'A doble cara: si uno tiene páginas impares, se deja la trasera en blanco para que el siguiente no salga detrás.')),
      sw),
    summary,
    h('p', { class: 'dc-hint' }, 'El número de copias se elige en la ventana de impresión.'),
    h('div', { class: 'dc-cl-actions' }, printBtn));

  paint();
  const close = openSheet('Imprimir juntos', body, { className: 'dc-cb-sheet' });
  return close;
}

// ---------- Construcción del documento combinado ----------

async function pdfPages(blob, urls) {
  let lib;
  try { lib = await loadPdfJs(); } catch { throw new Error('Para combinar PDF hace falta conexión la primera vez (se carga el lector de PDF).'); }
  const task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const pdf = await task.promise;
  const out = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: PDF_PX / Math.min(vp0.width, vp0.height) }); // lado corto a ~200 ppp
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const jpg = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
      cv.width = cv.height = 0; // libera memoria (importante en móviles)
      const url = URL.createObjectURL(jpg);
      urls.push(url);
      out.push(url);
      page.cleanup();
    }
  } finally { try { await task.destroy(); } catch {} }
  return out;
}

function fichaPart(html, i) {
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html');
  const css = [...doc.querySelectorAll('style')].map((s) => { const t = s.textContent; s.remove(); return t; }).join('\n');
  const links = [...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => { const o = l.outerHTML; l.remove(); return o; }).join('');
  const cls = esc(doc.body.getAttribute('class') || '');
  return `<div class="cb-ficha" data-part="${i}"><template shadowrootmode="open"><style>:host{display:block}.tb-body{display:block;margin:0}${scopeFichaCss(css)}</style>${links}<div class="tb-body ${cls}">${doc.body.innerHTML}</div></template></div>`;
}

/**
 * Une los documentos y abre la ventana de impresión. Devuelve 'printed'.
 * Lanza Error con un mensaje legible si algo falla.
 */
export async function printCombined(docs, { nuevaHoja = false } = {}) {
  const named = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('page', 'ficha');
  // Con páginas con nombre, PDF e imágenes ocupan la hoja entera y las fichas llevan sus márgenes.
  // Sin ellas (navegadores antiguos), todo comparte un margen de 10 mm.
  const pageBox = named ? 'width:210mm;height:296mm' : 'width:190mm;height:276mm';
  const fichaW = named ? 794 - 2 * 53 : 794 - 2 * 38;
  const urls = [];
  const parts = [];
  const pagesKnown = [];
  try {
    for (let i = 0; i < docs.length; i++) {
      const d = docs[i];
      toast(`Preparando ${i + 1} de ${docs.length}: ${d.titulo}`);
      const blob = await fetchBlob(d);
      if (!blob) throw new Error(`No se pudo obtener «${d.titulo}»`);
      const k = kindOf(d);
      if (k === 'pdf') {
        const imgs = await pdfPages(blob, urls);
        parts.push(imgs.map((u, n) => `<div class="cb-page" data-part="${i}"${n === imgs.length - 1 ? ` data-end="${i}"` : ''}><img src="${u}" alt=""></div>`).join(''));
        pagesKnown[i] = imgs.length;
        if (imgs.length && imgs.length !== d.paginas) store.update('documentos', d.id, { paginas: imgs.length });
      } else if (k === 'imagen') {
        const u = URL.createObjectURL(blob); urls.push(u);
        parts.push(`<div class="cb-page cb-img" data-part="${i}" data-end="${i}"><img src="${u}" alt=""></div>`);
        pagesKnown[i] = 1;
      } else if (k === 'ficha') {
        parts.push(fichaPart(await blob.text(), i).replace('class="cb-ficha"', `class="cb-ficha" data-end="${i}"`));
        pagesKnown[i] = null; // se mide al cargar
      } else throw new Error(`«${d.titulo}» no se puede combinar`);
    }

    const title = esc(docs.map((d) => d.titulo).join(' + ').slice(0, 120));
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>
@page{size:A4;margin:${named ? '0' : '10mm'}}
${named ? '@page ficha{size:A4;margin:14mm}' : ''}
html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cb>*+*{break-before:page}
.cb-page{${pageBox};display:flex;align-items:center;justify-content:center;overflow:hidden;break-inside:avoid;box-sizing:border-box}
.cb-page img{max-width:100%;max-height:100%;object-fit:contain;display:block}
${named ? '.cb-img{padding:10mm}' : ''}
.cb-ficha{display:block;${named ? 'page:ficha;' : ''}}
.cb-blank{height:10mm}
@media screen{.cb-ficha{width:${fichaW}px}}
</style></head><body><div class="cb">${parts.join('')}</div></body></html>`;

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals'); // sin scripts: las fichas no ejecutan nada
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:794px;height:1123px;border:0;visibility:hidden';
    await new Promise((resolve, reject) => {
      frame.onload = async () => {
        try {
          const doc = frame.contentDocument;
          // Navegadores sin shadow DOM declarativo: se crea a mano (sigue sin ejecutar nada)
          doc.querySelectorAll('template[shadowrootmode]').forEach((tpl) => {
            const host = tpl.parentElement;
            if (host && !host.shadowRoot) { host.attachShadow({ mode: 'open' }).append(tpl.content.cloneNode(true)); }
            tpl.remove();
          });
          await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
          await new Promise((r) => setTimeout(r, 200)); // fuentes y estilos de las fichas
          if (nuevaHoja) {
            const pages = docs.map((_, i) => pagesKnown[i] ?? fichaPagesFromHeight(doc.querySelector(`.cb-ficha[data-part="${i}"]`)?.getBoundingClientRect().height));
            blanksAfter(pages, { nuevaHoja }).forEach((b, i) => {
              if (!b) return;
              const end = doc.querySelector(`[data-end="${i}"]`);
              const blank = doc.createElement('div'); blank.className = 'cb-blank'; blank.innerHTML = '&nbsp;';
              end && end.after(blank);
            });
          }
          frame.contentWindow.focus();
          frame.contentWindow.print();
          resolve();
        } catch (e) { reject(e); }
      };
      frame.srcdoc = html;
      document.body.append(frame);
    });
    setTimeout(() => { frame.remove(); urls.forEach((u) => URL.revokeObjectURL(u)); }, 60_000);
    return 'printed';
  } catch (e) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    throw e;
  }
}
