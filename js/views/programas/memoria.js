// Tabula · Planes y programas · pestaña Memoria (vista previa, copiar y descargar)
import { store } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { buildMemoria } from '../../programs.js';
import { field, copyText, downloadText, safePainter } from './common.js';

/** Convierte el Markdown sencillo de buildMemoria en nodos DOM (sin innerHTML). */
export function renderMarkdown(md) {
  const out = [];
  let ul = null;
  const flush = () => { ul = null; };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flush(); out.push(h(m[1].length === 1 ? 'h2' : 'h3', { class: m[1].length === 1 ? 'pg-md-h1' : 'pg-md-h2' }, m[2])); continue; }
    if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      if (!ul) { ul = h('ul', { class: 'pg-md-list' }); out.push(ul); }
      let text = m[1]; let box = null;
      if (/^\[x\]\s/i.test(text)) { box = '☑'; text = text.slice(4); } else if (/^\[ \]\s/.test(text)) { box = '☐'; text = text.slice(4); }
      ul.append(h('li', {}, box ? h('span', { class: 'pg-md-box', 'aria-hidden': 'true' }, box) : null, text));
      continue;
    }
    flush();
    out.push(h('p', { class: 'pg-md-p' }, line));
  }
  return out;
}

/** Texto plano: los títulos pasan a mayúsculas subrayadas. */
function toPlain(md) {
  return md.split('\n').map((l) => {
    let m;
    if ((m = /^# (.*)$/.exec(l))) return `${m[1].toUpperCase()}\n${'='.repeat(m[1].length)}`;
    if ((m = /^## (.*)$/.exec(l))) return `${m[1]}\n${'-'.repeat(m[1].length)}`;
    return l;
  }).join('\n');
}

/** Curso '2026-27' → ['2026-09-01', '2027-08-31'] */
export function schoolYearRange(curso) {
  const y = Number(String(curso || '').slice(0, 4));
  if (!y) return ['', ''];
  return [`${y}-09-01`, `${y + 1}-08-31`];
}

export function mountMemoria(panel, programaId) {
  const p0 = store.get('programas', programaId);
  const [f0, t0] = schoolYearRange(p0?.cursoEscolar);
  const from = h('input', { class: 'input', type: 'date', value: f0, onchange: () => paint() });
  const to = h('input', { class: 'input', type: 'date', value: t0, onchange: () => paint() });
  const preview = h('article', { class: 'card pg-memoria', 'aria-label': 'Vista previa de la memoria' });
  let text = '';

  const name = (ext) => {
    const p = store.get('programas', programaId);
    return `memoria-${p.etiqueta}-${p.cursoEscolar}.${ext}`;
  };
  const copy = async () => toast((await copyText(text)) ? 'Texto copiado' : 'No se pudo copiar; selecciona el texto a mano');
  const bar = h('div', { class: 'pg-memoria-actions' },
    h('button', { type: 'button', class: 'btn btn-primary', onclick: copy }, 'Copiar texto'),
    h('button', { type: 'button', class: 'btn', onclick: () => downloadText(name('md'), text, 'text/markdown') }, icon('download', 16), 'Descargar (.md)'),
    h('button', { type: 'button', class: 'btn', onclick: () => downloadText(name('txt'), toPlain(text), 'text/plain') }, icon('download', 16), 'Descargar (.txt)'));

  function paint() {
    if (!store.get('programas', programaId)) return;
    text = buildMemoria(programaId, { from: from.value || undefined, to: to.value || undefined });
    preview.replaceChildren(...renderMarkdown(text));
  }

  panel.replaceChildren(
    h('section', { class: 'card pg-list-card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Memoria del programa')),
      h('p', { class: 'pg-hint pg-hint-block' }, 'Se genera sola a partir del diario, los objetivos y el equipo. Ajusta las fechas si solo quieres un periodo.'),
      h('div', { class: 'pg-two' }, field('Desde', from), field('Hasta', to)),
      bar),
    preview);
  paint();
  const repaint = safePainter(panel, paint);
  const unsubs = ['programas', 'diarioPrograma'].map((c) => store.subscribe(c, repaint));
  return () => unsubs.forEach((u) => u());
}
