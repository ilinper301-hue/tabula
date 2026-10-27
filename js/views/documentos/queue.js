// Tabula · Documentos · pestaña «Para imprimir» (cola de impresión)
import { store } from '../../store.js';
import { h, icon, toast, todayISO } from '../../ui.js';
import { queueSections, dueNow, sheetsCount, canPrint } from '../../documents.js';
import { isLectivo } from '../../planning.js';
import { getGroup } from '../../school.js';
import { thumb, docsById, itemSummary, printItem, markPrinted, removeItemWithUndo, printDoc, getDoc, plural, weekdayLong, dateLabel, openDoc } from './common.js';
import { openScheduleSheet } from './schedule.js';

let confirmIds = []; // elementos recién impresos en bloque, pendientes de «marcar como impresos»

export const lectivo = () => { const ev = store.list('events'); return (d) => isLectivo(d, ev); };

/** Cola con los documentos que siguen existiendo. */
export function liveQueue() {
  const byId = docsById();
  return store.list('impresiones').filter((i) => byId[i.documentoId]);
}

export function mountQueue(ctx) {
  const root = h('div', { class: 'dc-queue' });
  let busy = false;

  async function printAll() {
    if (busy) return;
    const byId = docsById();
    const due = dueNow(liveQueue(), todayISO());
    const printable = due.filter((i) => canPrint(byId[i.documentoId]));
    if (!printable.length) { toast('Nada que se pueda imprimir desde aquí'); return; }
    busy = true; paint();
    const done = [];
    let opened = 0;
    for (let i = 0; i < printable.length; i++) {
      const it = printable[i];
      toast(`Imprimiendo ${i + 1} de ${printable.length}: ${byId[it.documentoId].titulo}`);
      const res = await printItemQuiet(it);
      if (res === 'printed') done.push(it.id); else if (res === 'opened') opened++;
    }
    busy = false;
    confirmIds = done;
    if (opened) toast('Algunos se han abierto: usa Compartir → Imprimir');
    else if (!done.length) toast('No se pudo imprimir');
    paint();
  }
  // En bloque no se marca cada uno: se pregunta al final (la impresión del sistema no dice si se canceló)
  async function printItemQuiet(it) {
    const doc = getDoc(it.documentoId);
    if (!doc) return null;
    return printDoc(doc, { quiet: true });
  }

  function markAll(ids) {
    const all = store.list('impresiones');
    ids.forEach((id) => { const it = all.find((x) => x.id === id); if (it && it.estado !== 'impreso') markPrinted(it); });
    confirmIds = [];
    toast(`${plural(ids.length, 'documento marcado', 'documentos marcados')} como impreso${ids.length === 1 ? '' : 's'}`);
  }

  function row(it, byId, { showDate = false, printed = false } = {}) {
    const doc = byId[it.documentoId];
    const g = it.groupId ? getGroup(it.groupId) : null;
    const printable = canPrint(doc);
    return h('li', { class: `dc-row${printed ? ' is-done' : ''}` },
      h('button', { type: 'button', class: 'dc-row-thumb', 'aria-label': `Abrir ${doc.titulo}`, onclick: () => ctx.onOpen(doc.id) }, thumb(doc, { label: false, size: 20 })),
      h('div', { class: 'dc-row-main' },
        h('button', { type: 'button', class: 'dc-row-title', onclick: () => ctx.onOpen(doc.id) }, doc.titulo),
        h('span', { class: 'dc-row-sub' }, itemSummary(it)),
        h('span', { class: 'dc-row-chips' },
          showDate ? h('span', { class: `chip ${it.fecha && it.fecha < todayISO() ? 't1' : 't5'}` }, icon('calendario', 12), dateLabel(it.fecha)) : null,
          g ? h('span', { class: `chip ${g.color || 't3'}` }, g.nombre) : null,
          it.nota ? h('span', { class: 'dc-row-note' }, it.nota) : null)),
      h('div', { class: 'dc-row-actions' },
        printed
          ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { store.update('impresiones', it.id, { estado: 'pendiente', impresoEn: null }); } }, 'Volver a pendiente')
          : [
            printable
              ? h('button', { type: 'button', class: 'btn btn-sm dc-print', 'aria-label': `Imprimir ${doc.titulo}`, onclick: async (e) => { e.currentTarget.disabled = true; await printItem(it); } }, icon('printer', 16), 'Imprimir')
              : h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Abrir ${doc.titulo}`, onclick: () => openDoc(doc) }, icon('external', 16), 'Abrir'),
            h('button', { type: 'button', class: 'icon-btn dc-mark', title: 'Marcar como impreso', 'aria-label': `Marcar «${doc.titulo}» como impreso`, onclick: () => { markPrinted(it); toast('Marcado como impreso', { label: 'Deshacer', run: () => store.update('impresiones', it.id, { estado: 'pendiente', impresoEn: null }) }); } }, icon('check', 20)),
            h('button', { type: 'button', class: 'icon-btn', title: 'Editar', 'aria-label': `Editar impresión de «${doc.titulo}»`, onclick: () => openScheduleSheet({ itemId: it.id }) }, icon('edit', 18)),
          ],
        h('button', { type: 'button', class: 'icon-btn', title: 'Quitar de la cola', 'aria-label': `Quitar «${doc.titulo}» de la cola`, onclick: () => removeItemWithUndo(it) }, icon('trash', 18))));
  }

  function section(title, items, byId, { cls = '', showDate = false, printed = false, sub = '' } = {}) {
    if (!items.length) return null;
    return h('section', { class: `dc-section ${cls}`, 'aria-label': title },
      h('h2', { class: `section-label${cls === 'alert' ? ' alert' : ''}` }, title, h('span', { class: 'dc-section-n' }, String(items.length)), sub ? h('span', { class: 'dc-section-sub' }, sub) : null),
      h('ul', { class: 'dc-rows' }, ...items.map((it) => row(it, byId, { showDate, printed }))));
  }

  function paint() {
    const byId = docsById();
    const cola = liveQueue();
    const today = todayISO();
    const sec = queueSections(cola, today, lectivo());
    const due = dueNow(cola, today);
    const pendientes = cola.filter((i) => i.estado !== 'impreso');
    const dueSheets = sheetsCount(due, byId);

    const out = [];
    if (!cola.length || (!pendientes.length && !sec.impresos.length)) {
      out.push(h('div', { class: 'dc-empty' },
        h('div', { class: 'dc-empty-art', 'aria-hidden': 'true' }, icon('printer', 34), icon('check', 22)),
        h('h2', { class: 'dc-empty-title' }, 'Nada pendiente de imprimir'),
        h('p', {}, 'Programa desde la biblioteca lo que necesites para cada día y aquí tendrás la lista lista para la fotocopiadora.'),
        h('button', { type: 'button', class: 'btn', onclick: ctx.goLibrary }, icon('documentos', 16), 'Ir a la biblioteca')));
      root.replaceChildren(...out);
      return;
    }

    // Resumen
    if (confirmIds.length) {
      const ids = confirmIds.filter((id) => cola.some((i) => i.id === id && i.estado !== 'impreso'));
      if (ids.length) {
        out.push(h('div', { class: 'dc-summary dc-confirm', role: 'status' },
          h('div', { class: 'dc-summary-text' }, h('strong', {}, `¿Has impreso ${plural(ids.length, 'documento', 'documentos')}?`), h('span', {}, 'Márcalos para sacarlos de la lista de hoy.')),
          h('div', { class: 'dc-actions' },
            h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { confirmIds = []; paint(); } }, 'Ahora no'),
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => markAll(ids) }, icon('check', 16), 'Marcar como impresos'))));
      } else confirmIds = [];
    }
    out.push(h('div', { class: 'dc-summary' },
      h('div', { class: 'dc-summary-text' },
        h('strong', {}, due.length ? `${plural(due.length, 'documento', 'documentos')} para hoy` : 'Nada para hoy'),
        h('span', {}, due.length ? `Unas ${plural(dueSheets, 'hoja', 'hojas')} en total${sec.atrasados.length ? ` · ${sec.atrasados.length} atrasado${sec.atrasados.length > 1 ? 's' : ''}` : ''}` : `${plural(pendientes.length, 'pendiente', 'pendientes')} para más adelante`)),
      due.length ? h('button', { type: 'button', class: 'btn btn-primary', disabled: busy, onclick: printAll }, icon('printer', 16), busy ? 'Imprimiendo…' : 'Imprimir todo lo de hoy') : null));

    out.push(
      section('Atrasados', sec.atrasados, byId, { cls: 'alert', showDate: true }),
      section('Hoy', sec.hoy, byId),
      section(manLabel(sec.manana.fecha), sec.manana, byId),
      section('Más adelante', sec.despues, byId, { showDate: true }),
      section('Sin fecha', sec.sinFecha, byId),
      section('Impresos esta semana', sec.impresos, byId, { printed: true, cls: 'done' }));
    root.replaceChildren(...out.filter(Boolean));
  }

  // «Mañana» si es el día siguiente natural; si no, el nombre del día (p. ej. «Lunes»)
  function manLabel(iso) {
    if (!iso) return 'Mañana';
    const t = new Date(); t.setDate(t.getDate() + 1);
    return t.toLocaleDateString('sv-SE') === iso ? 'Mañana' : weekdayLong(iso);
  }

  paint();
  const unsub = ['impresiones', 'documentos', 'groups'].map((c) => store.subscribe(c, paint));
  return { el: root, destroy: () => unsub.forEach((u) => u()) };
}
