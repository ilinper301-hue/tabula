// Tabula · Documentos · campo «Documentos» de una sesión de Planificación
//
//   const f = docsField(sessionId);   // { el, destroy }
import { store } from '../../store.js';
import { h, icon } from '../../ui.js';
import { canPrint } from '../../documents.js';
import { thumb, printDoc, openDoc, plural } from './common.js';
import { openDocPicker } from './picker.js';
import { openScheduleSheet } from './schedule.js';
import { openDocDetail } from './detail.js';
import { pickFiles, uploadFiles } from './upload.js';

export function docsField(sessionId) {
  const get = () => store.get('sesiones', sessionId);
  const status = h('p', { class: 'dc-hint', role: 'status', 'aria-live': 'polite' });
  const list = h('ul', { class: 'dc-att-list' });
  const set = (ids) => store.update('sesiones', sessionId, { documentoIds: [...new Set(ids)] });
  const attach = (docs) => { if (docs.length) set([...(get()?.documentoIds || []), ...docs.map((d) => d.id)]); };

  function paint() {
    const ses = get();
    if (!ses) return;
    const docs = (ses.documentoIds || []).map((id) => store.get('documentos', id)).filter(Boolean);
    list.replaceChildren(...docs.map((d) => h('li', { class: 'dc-att' },
      h('button', { type: 'button', class: 'dc-att-open', 'aria-label': `Ver ${d.titulo}`, onclick: () => openDocDetail(d.id) },
        thumb(d, { label: false, size: 16 }), h('span', { class: 'dc-att-title' }, d.titulo)),
      h('div', { class: 'dc-att-actions' },
        canPrint(d) ? h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Imprimir ${d.titulo}`, onclick: () => printDoc(d) }, icon('printer', 15), 'Imprimir')
          : h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Abrir ${d.titulo}`, onclick: () => openDoc(d) }, icon('external', 15), 'Abrir'),
        h('button', {
          type: 'button', class: 'icon-btn dc-att-btn', title: 'Para imprimir el día de la sesión', 'aria-label': `Programar «${d.titulo}» para el día de la sesión`,
          onclick: () => openScheduleSheet({ documentoId: d.id, fecha: get()?.fecha || '', groupId: get()?.groupId, sesionId: sessionId }),
        }, icon('clock', 17)),
        h('button', { type: 'button', class: 'icon-btn dc-att-btn', title: 'Quitar de la sesión', 'aria-label': `Quitar «${d.titulo}» de la sesión`, onclick: () => set((get()?.documentoIds || []).filter((x) => x !== d.id)) }, icon('x', 17))))));
  }

  const el = h('section', { class: 'dc-att-field', 'aria-label': 'Documentos de la sesión' },
    h('h3', { class: 'section-label' }, icon('paperclip', 13), 'Documentos'),
    list, status,
    h('div', { class: 'dc-att-add' },
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => openDocPicker({ exclude: get()?.documentoIds || [], onPick: attach }) }, icon('paperclip', 15), 'Adjuntar'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => {
        const files = await pickFiles();
        if (files.length) attach(await uploadFiles(files, {}, (t) => { status.textContent = t || ''; }));
      } }, icon('upload', 15), 'Subir nuevo')));
  paint();
  const unsub = [store.subscribe('sesiones', paint), store.subscribe('documentos', paint)];
  return { el, destroy: () => unsub.forEach((u) => u()) };
}

export { plural };
