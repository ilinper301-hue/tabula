// Tabula · Documentos · pestaña «Para imprimir» (cola de impresión)
import { store } from '../../store.js';
import { h, icon, toast, todayISO } from '../../ui.js';
import { queueSections, dueNow, sheetsCount, canPrint } from '../../documents.js';
import { isLectivo } from '../../planning.js';
import { getGroup } from '../../school.js';
import { thumb, docsById, itemSummary, printItem, markPrinted, removeItemWithUndo, printDoc, getDoc, plural, weekdayLong, dateLabel, openDoc } from './common.js';
import { openScheduleSheet } from './schedule.js';
import { printTodayPlan } from '../../combine-model.js';
import { openCombineSheet } from './combine.js';
import { openMenu, openActionSheet } from '../../ui-kit.js';

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

  /** «Imprimir lo de hoy»: con un solo documento imprime directamente; con varios combinables pregunta cómo. */
  function printToday() {
    if (busy) return;
    const plan = printTodayPlan(dueNow(liveQueue(), todayISO()), docsById());
    if (plan.mode === 'none') {
      toast(plan.charta ? 'Las fichas de Charta se imprimen desde Charta: ábrelas una a una' : 'Nada que se pueda imprimir desde aquí');
      return;
    }
    if (plan.mode === 'direct') { printOneByOne(plan.items); return; }
    openActionSheet('Imprimir lo de hoy', [
      { icon: 'printer', label: 'Uno a uno', desc: 'Una ventana de impresión por documento, con sus copias y opciones', run: () => printOneByOne(plan.items) },
      { icon: 'planificacion', label: 'Todo junto (doble cara)', desc: 'Un solo trabajo, en orden: elige «Doble cara» en la ventana de impresión', run: () => combineAll(plan) },
    ], { intro: `${plural(plan.docIds.length, 'documento', 'documentos')} para imprimir${plan.charta ? ` (las fichas de Charta, aparte, desde Charta)` : ''}.`, className: 'dc-today-sheet' });
  }

  async function printOneByOne(items) {
    if (busy) return;
    const byId = docsById();
    busy = true; paint();
    const done = [];
    let opened = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (items.length > 1) toast(`Imprimiendo ${i + 1} de ${items.length}: ${byId[it.documentoId].titulo}`);
      const res = await printItemQuiet(it);
      if (res === 'printed') done.push(it.id); else if (res === 'opened') opened++;
    }
    busy = false;
    confirmIds = done;
    if (opened) toast('Algunos se han abierto: usa Compartir → Imprimir');
    else if (!done.length) toast('No se pudo imprimir');
    paint();
  }
  // Todo lo de hoy en un solo trabajo (p. ej. dos fichas en el mismo folio, una por cada cara)
  function combineAll(plan) {
    const ids = new Set(plan.docIds);
    const items = plan.items.filter((i) => ids.has(i.documentoId));
    openCombineSheet(plan.docIds, { onPrinted: () => { confirmIds = items.map((i) => i.id); paint(); } });
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

  const backToPending = (it) => store.update('impresiones', it.id, { estado: 'pendiente', impresoEn: null });

  function rowMenu(it, doc, printed) {
    return printed ? [
      { icon: 'clock', label: 'Volver a pendiente', run: () => backToPending(it) },
      '-',
      { icon: 'trash', label: 'Quitar de la cola', danger: true, run: () => removeItemWithUndo(it) },
    ] : [
      { icon: 'check', label: 'Marcar como impreso', run: () => { markPrinted(it); toast('Marcado como impreso', { label: 'Deshacer', run: () => backToPending(it) }); } },
      { icon: 'edit', label: 'Editar', desc: 'Fecha, copias, grupo…', run: () => openScheduleSheet({ itemId: it.id }) },
      '-',
      { icon: 'trash', label: 'Quitar de la cola', danger: true, run: () => removeItemWithUndo(it) },
    ];
  }

  function row(it, byId, { showDate = false, printed = false } = {}) {
    const doc = byId[it.documentoId];
    const g = it.groupId ? getGroup(it.groupId) : null;
    const printable = canPrint(doc);
    const label = `Más opciones para «${doc.titulo}»`;
    const more = h('button', {
      type: 'button', class: 'icon-btn dc-row-more', dataset: { key: `more-${it.id}` }, 'aria-label': label, title: 'Más opciones', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
      onclick: () => openMenu(more, rowMenu(it, doc, printed), { label }),
    }, icon('mas', 20));
    return h('li', { class: `dc-row${printed ? ' is-done' : ''}` },
      h('button', { type: 'button', class: 'dc-row-thumb', 'aria-label': `Ver la ficha de ${doc.titulo}`, tabindex: '-1', onclick: () => ctx.onOpen(doc.id) }, thumb(doc, { label: false, size: 20 })),
      h('div', { class: 'dc-row-main' },
        h('button', { type: 'button', class: 'dc-row-title', dataset: { key: `title-${it.id}` }, onclick: () => ctx.onOpen(doc.id) }, doc.titulo),
        h('span', { class: 'dc-row-sub' }, itemSummary(it)),
        h('span', { class: 'dc-row-chips' },
          showDate ? h('span', { class: `chip ${it.fecha && it.fecha < todayISO() ? 't1' : 't5'}` }, icon('calendario', 12), dateLabel(it.fecha)) : null,
          printed && it.impresoEn ? h('span', { class: 'chip t3' }, icon('check', 12), 'Impreso') : null,
          g ? h('span', { class: `chip ${g.color || 't3'}` }, g.nombre) : null,
          it.nota ? h('span', { class: 'dc-row-note' }, it.nota) : null)),
      printed ? null
        : printable
          ? h('button', { type: 'button', class: 'btn btn-sm dc-row-act', dataset: { key: `act-${it.id}` }, 'aria-label': doc.charta ? `Imprimir «${doc.titulo}» en Charta` : `Imprimir «${doc.titulo}»`, onclick: async (e) => { const b = e.currentTarget; b.disabled = true; try { await printItem(it); } finally { b.disabled = false; } } }, icon('printer', 16), 'Imprimir')
          : h('button', { type: 'button', class: 'btn btn-sm dc-row-act', dataset: { key: `act-${it.id}` }, 'aria-label': `Abrir «${doc.titulo}»`, onclick: () => openDoc(doc) }, icon('external', 16), 'Abrir'),
      more);
  }

  function section(title, items, byId, { cls = '', showDate = false, printed = false, sub = '' } = {}) {
    if (!items.length) return null;
    return h('section', { class: `dc-section ${cls}`, 'aria-label': title },
      h('h2', { class: `section-label${cls === 'alert' ? ' alert' : ''}` }, title, h('span', { class: 'dc-section-n' }, String(items.length)), sub ? h('span', { class: 'dc-section-sub' }, sub) : null),
      h('ul', { class: 'dc-rows' }, ...items.map((it) => row(it, byId, { showDate, printed }))));
  }

  function paint() {
    const focusKey = root.contains(document.activeElement) ? document.activeElement.dataset?.key : null;
    paintInner();
    if (focusKey) root.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  function paintInner() {
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
    const plan = printTodayPlan(due, byId);
    out.push(h('div', { class: 'dc-summary' },
      h('div', { class: 'dc-summary-text' },
        h('strong', {}, due.length ? `${plural(due.length, 'documento', 'documentos')} para hoy` : 'Nada para hoy'),
        h('span', {}, due.length ? `Unas ${plural(dueSheets, 'hoja', 'hojas')} en total${sec.atrasados.length ? ` · ${sec.atrasados.length} atrasado${sec.atrasados.length > 1 ? 's' : ''}` : ''}` : `${plural(pendientes.length, 'pendiente', 'pendientes')} para más adelante`)),
      plan.mode !== 'none' ? h('button', {
        type: 'button', class: 'btn btn-primary dc-today', disabled: busy, onclick: printToday, dataset: { key: 'today' },
        'aria-haspopup': plan.mode === 'choose' ? 'dialog' : null,
      }, icon('printer', 16), busy ? 'Imprimiendo…' : 'Imprimir lo de hoy') : null));

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
