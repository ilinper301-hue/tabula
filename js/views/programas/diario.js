// Tabula · Planes y programas · pestaña Diario (anotar, línea de tiempo, filtros y estadísticas)
import { store } from '../../store.js';
import { h, icon, toast, relativeDay, longDate, fromISO, MESES } from '../../ui.js';
import { ENTRY_TYPES, listEntries, programStats, fmtDuration } from '../../programs.js';
import { entryForm } from './quick.js';
import { cap, norm, plural, extLink, cleanUrl, safePainter } from './common.js';

const monthTitle = (ym) => { const [y, m] = ym.split('-').map(Number); return `${cap(MESES[m - 1])} ${y}`; };

export function mountDiario(panel, programaId) {
  const filter = { tipo: '', q: '' };
  let editingId = null;

  const stats = h('section', { class: 'pg-stats', 'aria-label': 'Resumen del diario' });
  const composer = entryForm({ programaId });
  const composerCard = h('section', { class: 'card pg-composer', 'aria-label': 'Nueva anotación' }, composer.el);

  // --- Filtros (campos persistentes: no se recrean al repintar)
  const search = h('input', {
    class: 'input pg-search-input', type: 'search', placeholder: 'Buscar en el diario…', 'aria-label': 'Buscar en el diario', autocomplete: 'off',
    oninput: () => { filter.q = search.value; paintList(); },
  });
  const tipoSel = h('select', {
    class: 'select pg-filter-select', 'aria-label': 'Filtrar por tipo',
    onchange: () => { filter.tipo = tipoSel.value; paintList(); },
  }, h('option', { value: '' }, 'Todos los tipos'),
  Object.entries(ENTRY_TYPES).map(([k, v]) => h('option', { value: k }, v.label)));
  const filters = h('div', { class: 'pg-filters' },
    h('div', { class: 'pg-search' }, icon('search', 16), search), tipoSel);
  const list = h('div', { class: 'pg-timeline' });

  panel.replaceChildren(stats, composerCard, filters, list);

  // ---------- Estadísticas ----------
  function paintStats() {
    const st = programStats(programaId);
    const max = Math.max(1, ...Object.values(st.porTipo).map((v) => v.n));
    const bars = Object.entries(ENTRY_TYPES).filter(([k]) => st.porTipo[k]).map(([k, def]) => {
      const v = st.porTipo[k];
      return h('li', { class: 'pg-bar-row' },
        h('span', { class: 'pg-bar-label' }, def.label),
        h('span', { class: 'pg-bar-track', 'aria-hidden': 'true' }, h('span', { class: `pg-bar-fill ${def.color}`, style: { width: `${Math.max(6, (v.n / max) * 100)}%` } })),
        h('span', { class: 'pg-bar-n' }, String(v.n)));
    });
    stats.replaceChildren(...[
      h('div', { class: 'pg-stat' }, h('strong', {}, String(st.entradas)), h('span', {}, st.entradas === 1 ? 'anotación' : 'anotaciones')),
      h('div', { class: 'pg-stat' }, h('strong', {}, st.minutos ? fmtDuration(st.minutos) : '—'), h('span', {}, 'tiempo total')),
      bars.length ? h('ul', { class: 'pg-bars', 'aria-label': 'Anotaciones por tipo' }, bars) : null].filter(Boolean));
  }

  // ---------- Línea de tiempo ----------
  function matches(e) {
    if (filter.tipo && e.tipo !== filter.tipo) return false;
    const q = norm(filter.q.trim());
    return !q || norm(`${e.texto} ${e.enlace} ${ENTRY_TYPES[e.tipo]?.label || ''}`).includes(q);
  }

  function entryRow(e) {
    if (e.id === editingId) return editRow(e);
    const def = ENTRY_TYPES[e.tipo] || ENTRY_TYPES.otro;
    return h('li', { class: 'pg-entry' },
      h('div', { class: 'pg-entry-date', title: longDate(fromISO(e.fecha)) }, relativeDay(e.fecha)),
      h('div', { class: 'pg-entry-main' },
        h('div', { class: 'pg-entry-meta' },
          h('span', { class: `chip ${def.color}` }, def.label),
          e.duracionMin ? h('span', { class: 'pg-dur' }, icon('clock', 13), fmtDuration(e.duracionMin)) : null),
        h('p', { class: 'pg-entry-text' }, e.texto || '—'),
        e.enlace ? h('p', { class: 'pg-entry-link' }, extLink(e.enlace, e.enlace.replace(/^https?:\/\//, ''))) : null),
      h('div', { class: 'pg-entry-actions' },
        h('button', { type: 'button', class: 'link-btn', 'aria-label': `Editar anotación del ${e.fecha}`, onclick: () => { editingId = e.id; paintList(); } }, 'Editar'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Eliminar anotación del ${e.fecha}`, onclick: () => remove(e) }, icon('trash', 18))));
  }

  function remove(e) {
    const removed = store.remove('diarioPrograma', e.id);
    if (removed) toast('Anotación eliminada', { label: 'Deshacer', run: () => store.restore('diarioPrograma', removed) });
  }

  function editRow(e) {
    const texto = h('textarea', { class: 'textarea', rows: 3, 'aria-label': 'Texto de la anotación' }); texto.value = e.texto || '';
    const tipo = h('select', { class: 'select', 'aria-label': 'Tipo' }, Object.entries(ENTRY_TYPES).map(([k, v]) => h('option', { value: k, selected: k === e.tipo }, v.label)));
    const fecha = h('input', { class: 'input', type: 'date', value: e.fecha, 'aria-label': 'Fecha' });
    const dur = h('input', { class: 'input', type: 'number', min: '1', max: '1440', value: e.duracionMin || '', placeholder: 'min', 'aria-label': 'Duración en minutos' });
    const link = h('input', { class: 'input', type: 'url', value: e.enlace || '', placeholder: 'https://…', 'aria-label': 'Enlace' });
    const err = h('p', { class: 'pg-error', role: 'alert', hidden: true });
    const save = () => {
      const url = cleanUrl(link.value);
      if (!texto.value.trim()) { err.textContent = 'El texto no puede quedar vacío.'; err.hidden = false; texto.focus(); return; }
      if (url === null) { err.textContent = 'El enlace debe empezar por http:// o https://.'; err.hidden = false; link.focus(); return; }
      if (!fecha.value) { err.textContent = 'Elige una fecha.'; err.hidden = false; fecha.focus(); return; }
      editingId = null; document.activeElement?.blur();
      store.update('diarioPrograma', e.id, {
        texto: texto.value.trim(), tipo: tipo.value, fecha: fecha.value, enlace: url,
        duracionMin: Number(dur.value) > 0 ? Math.round(Number(dur.value)) : null,
      });
    };
    texto.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(); } if (ev.key === 'Escape') { editingId = null; paintList(); } });
    setTimeout(() => texto.focus(), 0);
    return h('li', { class: 'pg-entry is-editing' },
      h('form', { class: 'pg-edit-form', novalidate: true, onsubmit: (ev) => { ev.preventDefault(); save(); } },
        texto,
        h('div', { class: 'pg-form-row' }, tipo, fecha, dur),
        link, err,
        h('div', { class: 'pg-actions' },
          h('span', { class: 'pg-spacer' }),
          h('button', { type: 'button', class: 'btn', onclick: () => { editingId = null; paintList(); } }, 'Cancelar'),
          h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar'))));
  }

  function paintList() {
    const all = listEntries(programaId);
    const shown = all.filter(matches);
    if (!all.length) {
      list.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'empty' }, icon('note', 36),
        h('strong', {}, 'Todavía no hay anotaciones'),
        'Escribe arriba lo que has hecho hoy por este programa. Después podrás generar la memoria con un clic.')));
      return;
    }
    if (!shown.length) {
      list.replaceChildren(h('div', { class: 'empty' }, icon('search', 32), h('strong', {}, 'Sin resultados'), 'Prueba con otro texto o quita el filtro.'));
      return;
    }
    const groups = [];
    for (const e of shown) {
      const ym = e.fecha.slice(0, 7);
      const last = groups[groups.length - 1];
      if (last && last.ym === ym) last.items.push(e); else groups.push({ ym, items: [e] });
    }
    const filtered = filter.tipo || filter.q.trim();
    list.replaceChildren(...[
      filtered ? h('p', { class: 'pg-hint pg-count', role: 'status' }, `${plural(shown.length, 'anotación', 'anotaciones')} de ${all.length}`) : null,
      ...groups.map((g) => h('section', { class: 'pg-month', 'aria-label': monthTitle(g.ym) },
        h('h3', { class: 'section-label' }, monthTitle(g.ym), h('span', { class: 'pg-month-n' }, plural(g.items.length, 'anotación', 'anotaciones'))),
        h('ul', { class: 'card pg-entries' }, g.items.map(entryRow))))].filter(Boolean));
  }

  const repaint = safePainter(list, paintList);
  paintStats(); paintList();
  const unsubs = [store.subscribe('diarioPrograma', () => { paintStats(); repaint(); })];
  // «Hoy», «Ayer»… se refrescan al volver a la pestaña del navegador (por si cambió el día)
  const onVis = () => { if (!document.hidden) paintList(); };
  document.addEventListener('visibilitychange', onVis);
  return () => { unsubs.forEach((u) => u()); document.removeEventListener('visibilitychange', onVis); };
}
