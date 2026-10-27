// Tabula · Documentos · selector de documentos existentes (para adjuntar a sesiones, etc.)
import { store } from '../../store.js';
import { h, icon, openSheet } from '../../ui.js';
import { filterDocs } from '../../documents.js';
import { thumb, metaLine, plural } from './common.js';
import { pickFiles, uploadFiles } from './upload.js';

/** onPick(docs[]) con los documentos elegidos (o recién subidos). */
export function openDocPicker({ exclude = [], onPick, title = 'Adjuntar documentos' } = {}) {
  const chosen = new Set();
  const search = h('input', { class: 'input', id: 'dc-pick-q', type: 'search', placeholder: 'Buscar…', autocomplete: 'off', 'aria-label': 'Buscar documentos' });
  const list = h('ul', { class: 'dc-pick-list' });
  const status = h('p', { class: 'dc-hint', role: 'status', 'aria-live': 'polite' });
  const confirm = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Adjuntar');

  const paintBtn = () => { confirm.disabled = !chosen.size; confirm.textContent = chosen.size ? `Adjuntar ${plural(chosen.size, 'documento', 'documentos')}` : 'Adjuntar'; };
  function paint() {
    const docs = filterDocs(store.list('documentos').filter((d) => !exclude.includes(d.id)), { q: search.value }, 'recientes');
    if (!docs.length) {
      list.replaceChildren(h('li', { class: 'dc-pick-empty' }, search.value ? 'Nada coincide con la búsqueda.' : store.list('documentos').length ? 'Ya has adjuntado todos tus documentos.' : 'Aún no tienes documentos. Sube el primero.'));
      return;
    }
    list.replaceChildren(...docs.map((d) => {
      const on = chosen.has(d.id);
      return h('li', {}, h('button', {
        type: 'button', class: `dc-pick-item${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => { on ? chosen.delete(d.id) : chosen.add(d.id); paintBtn(); paint(); },
      }, thumb(d, { label: false, size: 20 }),
      h('span', { class: 'dc-pick-text' }, h('span', { class: 'dc-pick-title' }, d.titulo), h('span', { class: 'dc-card-meta' }, metaLine(d))),
      h('span', { class: 'dc-pick-check', 'aria-hidden': 'true' }, on ? icon('check', 16) : null)));
    }));
  }
  search.addEventListener('input', paint);
  confirm.addEventListener('click', () => {
    const docs = [...chosen].map((id) => store.get('documentos', id)).filter(Boolean);
    close(); onPick && onPick(docs);
  });
  const upload = h('button', { type: 'button', class: 'btn', onclick: async () => {
    const files = await pickFiles();
    if (!files.length) return;
    const docs = await uploadFiles(files, {}, (t) => { status.textContent = t || ''; });
    if (docs.length) { close(); onPick && onPick(docs); }
  } }, icon('upload', 16), 'Subir nuevo');

  const body = h('div', { class: 'dc-picker' }, search, status, list,
    h('div', { class: 'dc-actions dc-pick-foot' }, upload, confirm));
  paint();
  const close = openSheet(title, body);
  return close;
}
