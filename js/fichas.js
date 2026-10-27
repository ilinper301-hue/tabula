// Tabula · fichas hechas con Claude (lógica pura, sin DOM salvo sanitizeHtml).
// Convierte lo que se pega desde Claude (HTML, Markdown o texto) en una ficha HTML imprimible en A4.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Texto en línea de Markdown: **negrita**, *cursiva*, `código`, ☐ para [ ]. */
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[ \]/g, '☐').replace(/\[x\]/gi, '☑');
}

/** Markdown sencillo → HTML (títulos, listas, tablas, citas, separadores, párrafos). */
export function mdToHtml(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) && !/^_{3,}$/.test(l.trim()) ) { out.push('<hr>'); i++; continue; }
    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l); i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i++; }
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, j) => `<td>${inline(r[j] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')); i++; }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s|^\s*([-*+]|\d+[.)])\s+|^\s*>/.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) { p.push(lines[i]); i++; }
    out.push(`<p>${p.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

/** Plantilla A4 para fichas en Markdown/texto: cabecera con nombre y fecha, letra grande y clara. */
export function fichaDocument(bodyHtml, titulo = 'Ficha') {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{font-family:"Inter","Helvetica Neue",Arial,sans-serif;font-size:15pt;line-height:1.55;color:#1f1e1c;margin:0;padding:8mm 0}
.tb-head{display:flex;gap:16px;align-items:flex-end;border-bottom:1.5px solid #1f1e1c;padding-bottom:8px;margin-bottom:18px;font-size:12pt}
.tb-head span{flex:1;border-bottom:1px dotted #888;padding-bottom:2px}
.tb-head span.f{flex:0 0 32%}
h1{font-family:Georgia,"Source Serif 4",serif;font-weight:600;font-size:22pt;margin:0 0 12px}
h2{font-family:Georgia,serif;font-size:17pt;margin:20px 0 8px}
h3{font-size:15pt;margin:16px 0 6px}
p{margin:0 0 10px}
ol,ul{margin:0 0 12px;padding-left:1.3em}li{margin:0 0 10px}
table{border-collapse:collapse;width:100%;margin:8px 0 14px}th,td{border:1px solid #555;padding:8px 10px;text-align:left;vertical-align:top}th{background:#f1efe8}
blockquote{margin:10px 0;padding:8px 14px;border-left:4px solid #3E5C76;background:#f6f4ee}
hr{border:0;border-top:1px solid #bbb;margin:18px 0}
code{font-family:inherit;background:#f1efe8;padding:0 4px;border-radius:4px}
@media print{body{padding:0}}
</style></head><body>
<div class="tb-head"><span>Nombre:</span><span class="f">Fecha:</span></div>
${bodyHtml}
</body></html>`;
}

const looksLikeHtml = (s) => /<(html|body|div|section|table|h[1-6]|p|style|svg|main|article)[\s>]/i.test(s);

/**
 * Interpreta lo pegado desde Claude.
 * - Si trae un bloque ```html …```, usa ese bloque.
 * - Si es HTML (documento o fragmento), lo usa (un fragmento se envuelve en la plantilla).
 * - Si no, lo trata como Markdown/texto y lo envuelve en la plantilla.
 * @param html  contenido text/html del portapapeles, si lo hubo (p. ej. al copiar una respuesta formateada)
 * @returns { html, titulo, formato: 'html' | 'markdown' }
 */
export function fromClaude(text, html = '') {
  let src = String(text || '').trim();
  const fence = src.match(/```(?:html)?\s*\n([\s\S]*?)```/i);
  if (fence && looksLikeHtml(fence[1])) src = fence[1].trim();
  let out, formato;
  if (looksLikeHtml(src)) {
    formato = 'html';
    out = /<html[\s>]/i.test(src) ? src : fichaDocument(src);
  } else if (!src && html && looksLikeHtml(html)) {
    formato = 'html';
    out = fichaDocument(html);
  } else {
    formato = 'markdown';
    out = fichaDocument(mdToHtml(src));
  }
  return { html: out, titulo: guessTitle(out) || 'Ficha', formato };
}

/** Título: <title>, si no el primer <h1>/<h2>. */
export function guessTitle(html) {
  const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t && strip(t[1]) && strip(t[1]) !== 'Ficha') return strip(t[1]).slice(0, 90);
  const hh = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
  return hh ? strip(hh[1]).slice(0, 90) : '';
}

/**
 * Quita lo que podría ejecutarse (scripts, iframes, manejadores on*, enlaces javascript:).
 * Las fichas solo necesitan HTML y CSS. Requiere DOMParser (navegador).
 */
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, frame, frameset, base, form, meta[http-equiv], link:not([rel="stylesheet"])').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const v = a.value.trim().toLowerCase();
      if (a.name.startsWith('on') || ((a.name === 'href' || a.name === 'src' || a.name === 'xlink:href' || a.name === 'action' || a.name === 'formaction') && /^(javascript|vbscript|data:text\/html)/.test(v))) el.removeAttribute(a.name);
    }
  });
  if (!doc.querySelector('meta[charset]')) doc.head.prepend(Object.assign(doc.createElement('meta'), { charset: 'utf-8' }));
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

/** Nombre de archivo seguro a partir del título. */
export const fileNameFor = (titulo) => `${String(titulo || 'Ficha').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'ficha'}.html`;

/** Instrucciones para un Proyecto de Claude que genere fichas compatibles con Tabula. */
export function claudeProjectInstructions({ curso = '', centro = '' } = {}) {
  return `Eres mi ayudante para crear fichas y materiales de Educación Primaria${centro ? ` (${centro})` : ''}, en Andalucía${curso ? `; mi grupo es de ${curso}` : ''}.

Cuando te pida una ficha:
1. Créala como UN ÚNICO documento HTML completo (<!doctype html> … </html>) con el CSS dentro de <style>. Sin JavaScript y sin enlaces a archivos externos; si hace falta un dibujo, hazlo con SVG dentro del propio HTML.
2. Pensada para imprimir en A4 vertical: @page { size: A4; margin: 14mm }, fondo blanco, buen contraste, que no se corte nada entre páginas (usa break-inside: avoid en cada ejercicio).
3. Arriba: líneas para «Nombre» y «Fecha», y un título claro con <h1>.
4. Letra grande y legible, adaptada a la edad (en 1.º y 2.º, mínimo 16 pt y mucho espacio para escribir). Enunciados cortos, numerados y con un ejemplo resuelto cuando ayude.
5. Si te lo pido, añade al final o en página aparte las soluciones para el docente.
6. Lenguaje inclusivo y cercano; contenidos alineados con los criterios de evaluación de Andalucía (Orden de 30 de mayo de 2023) cuando te indique el curso y el área.
7. Entrega el HTML en un solo bloque de código \`\`\`html para que pueda copiarlo entero y pegarlo en Tabula (Documentos → Pegar de Claude).`;
}
