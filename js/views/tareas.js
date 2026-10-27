// Tabula · vista «Tareas»
import { store } from '../store.js';
import { h, icon, todayISO, diffDays, fromISO, toISO, DIAS, MESES, toast } from '../ui.js';
import { parseQuickInput, createTask, sortTasks, allTags, isOverdue, taskRow } from '../tasks-model.js';

const VISTAS = [['hoy', 'Hoy'], ['proximas', 'Próximas'], ['todas', 'Todas']];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// La sección «Completadas» recuerda si está abierta mientras se navega.
let completedOpen = false;

/** Etiqueta de día para la vista «Próximas». */
function dayLabel(iso) {
  const diff = diffDays(iso, todayISO());
  if (diff === 1) return 'Mañana';
  const d = fromISO(iso);
  return `${cap(DIAS[d.getDay()])}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** Texto del aviso tras añadir una tarea. */
function addedMessage(t) {
  let m = 'Tarea añadida';
  if (t.due) {
    const diff = diffDays(t.due, todayISO());
    const d = fromISO(t.due);
    if (diff === 0) m = 'Añadida para hoy';
    else if (diff === 1) m = 'Añadida para mañana';
    else if (diff > 1 && diff < 7) m = `Añadida para el ${DIAS[d.getDay()]}`;
    else m = `Añadida para el ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }
  if (t.time) m += ` a las ${t.time}`;
  return m;
}

export function render(container, params = new URLSearchParams()) {
  const vista = VISTAS.some(([k]) => k === params.get('vista')) ? params.get('vista') : 'hoy';
  const tagFilter = (params.get('tag') || '').toLowerCase() || null;

  /** Cambia vista/etiqueta a través del hash (el router vuelve a pintar). */
  const go = (patch) => {
    const p = new URLSearchParams();
    const v = patch.vista ?? vista;
    const tg = 'tag' in patch ? patch.tag : tagFilter;
    p.set('vista', v);
    if (tg) p.set('tag', tg);
    location.hash = `#/tareas?${p}`;
  };

  // ---- Cabecera (estática: el composer conserva el foco al re-renderizar la lista)
  const eyebrow = h('div', { class: 'eyebrow' });
  const input = h('input', {
    type: 'text', id: 'tareas-quick', autocomplete: 'off', enterkeyhint: 'done',
    placeholder: 'Nueva tarea… ej. «corregir dictado mañana #lengua»',
    'aria-label': 'Nueva tarea',
  });
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    const p = parseQuickInput(text);
    // Con un filtro de etiqueta activo, la nueva tarea la hereda para que no «desaparezca».
    if (tagFilter && !p.tags.includes(tagFilter)) p.tags.push(tagFilter);
    const task = createTask(p);
    input.value = '';
    toast(addedMessage(task));
    input.focus();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } });
  const composer = h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); add(); } },
    input,
    h('button', { type: 'submit', class: 'send', 'aria-label': 'Añadir tarea' }, icon('plus', 18)));

  const tabs = h('div', { class: 'segmented tareas-tabs', role: 'tablist', 'aria-label': 'Vista de tareas' },
    VISTAS.map(([k, label]) => h('button', {
      type: 'button', role: 'tab', id: `tab-${k}`, 'aria-selected': String(k === vista),
      'aria-controls': 'tareas-panel', tabindex: k === vista ? '0' : '-1',
      onclick: () => go({ vista: k }),
      onkeydown: (e) => {
        const i = VISTAS.findIndex(([x]) => x === vista);
        const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (j !== null && VISTAS[j]) { e.preventDefault(); go({ vista: VISTAS[j][0] }); }
      },
    }, label)));

  const panel = h('div', { id: 'tareas-panel', role: 'tabpanel', 'aria-labelledby': `tab-${vista}`, class: 'tareas-panel' });

  container.replaceChildren(h('div', { class: 'tareas-view' },
    h('header', { class: 'page-head' },
      h('div', {}, eyebrow, h('h1', { class: 'page-title' }, 'Tareas')),
      composer),
    tabs, panel));

  // ---- Parte dinámica: etiquetas + listas
  function group(label, tasks, { alert = false, showDate = true } = {}) {
    return h('section', { class: 'tareas-group' },
      h('h2', { class: `section-label${alert ? ' alert' : ''}` }, label),
      h('ul', { class: 'task-list' }, tasks.map((t) => taskRow(t, { showDate }))));
  }

  function paint() {
    const today = todayISO();
    const all = store.list('tasks');
    const tags = allTags();
    const byTag = (t) => !tagFilter || (t.tags || []).includes(tagFilter);
    const visible = all.filter(byTag);
    const pending = visible.filter((t) => !t.done);
    const overdue = pending.filter(isOverdue);

    // Resumen
    eyebrow.textContent = pending.length
      ? `${plural(pending.length, 'pendiente', 'pendientes')}${overdue.length ? ` · ${plural(overdue.length, 'vencida', 'vencidas')}` : ''}`
      : 'Todo al día';

    // Filtro por etiqueta
    const tagNames = tagFilter && !tags.includes(tagFilter) ? [...tags, tagFilter] : tags;
    const tagRow = tagNames.length
      ? h('div', { class: 'tag-filter', role: 'group', 'aria-label': 'Filtrar por etiqueta' },
          tagNames.map((t) => h('button', {
            type: 'button', class: `tag-toggle${t === tagFilter ? ' on' : ''}`, 'aria-pressed': String(t === tagFilter),
            onclick: () => go({ tag: t === tagFilter ? null : t }),
          }, `#${t}`)))
      : null;

    // Grupos según la vista
    const groups = [];
    let emptyTitle, emptyHint, emptyIcon = 'tareas';
    if (vista === 'hoy') {
      const od = sortTasks(overdue);
      const td = sortTasks(pending.filter((t) => t.due === today));
      if (od.length) groups.push(group('Vencidas', od, { alert: true }));
      if (td.length) groups.push(group('Hoy', td, { showDate: false }));
      emptyTitle = 'Nada pendiente para hoy';
      emptyHint = 'Disfruta del respiro o apunta algo arriba.';
      emptyIcon = 'hoy';
    } else if (vista === 'proximas') {
      const future = sortTasks(pending.filter((t) => t.due && t.due > today));
      const days = new Map();
      future.forEach((t) => { if (!days.has(t.due)) days.set(t.due, []); days.get(t.due).push(t); });
      days.forEach((list, iso) => groups.push(group(dayLabel(iso), list, { showDate: false })));
      emptyTitle = 'No hay tareas próximas';
      emptyHint = 'Prueba con «examen el viernes» en la caja de arriba.';
      emptyIcon = 'calendario';
    } else {
      const od = sortTasks(overdue);
      const td = sortTasks(pending.filter((t) => t.due === today));
      const up = sortTasks(pending.filter((t) => t.due && t.due > today));
      const nd = sortTasks(pending.filter((t) => !t.due));
      if (od.length) groups.push(group('Vencidas', od, { alert: true }));
      if (td.length) groups.push(group('Hoy', td, { showDate: false }));
      if (up.length) groups.push(group('Próximas', up));
      if (nd.length) groups.push(group('Sin fecha', nd));
      emptyTitle = 'Todavía no hay tareas';
      emptyHint = 'Escribe la primera en la caja de arriba.';
    }
    if (tagFilter) { emptyTitle = `Sin tareas con #${tagFilter}`; emptyHint = 'Quita el filtro para ver el resto.'; }

    const main = groups.length
      ? h('div', { class: 'card tareas-card' }, groups)
      : h('div', { class: 'card' }, h('div', { class: 'empty' }, icon(emptyIcon, 36), h('strong', {}, emptyTitle), emptyHint));

    // Completadas (en «Hoy», solo las de hoy)
    let done = visible.filter((t) => t.done);
    if (vista === 'hoy') done = done.filter((t) => t.doneAt && toISO(new Date(t.doneAt)) === today);
    done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    let completed = null;
    if (done.length) {
      const list = h('ul', { class: 'task-list', id: 'tareas-done', hidden: !completedOpen }, done.map((t) => taskRow(t, { compact: true })));
      const toggle = h('button', {
        type: 'button', class: 'completed-toggle', 'aria-expanded': String(completedOpen), 'aria-controls': 'tareas-done',
        onclick: () => {
          completedOpen = !completedOpen;
          toggle.setAttribute('aria-expanded', String(completedOpen));
          list.hidden = !completedOpen;
        },
      }, icon('chevronDown', 16, 'chev'), `Completadas (${done.length})`);
      completed = h('section', { class: 'tareas-completed' }, toggle, h('div', { class: 'card tareas-card' }, list));
    }

    panel.replaceChildren(...[tagRow, main, completed].filter(Boolean));
  }

  paint();
  const unsub = store.subscribe('tasks', paint);

  // Atajo «n»: enfoca la caja de captura cuando no se está escribiendo.
  const onKey = (e) => {
    if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
    if (document.querySelector('.overlay')) return; // hay una hoja abierta
    e.preventDefault();
    input.focus();
  };
  document.addEventListener('keydown', onKey);

  return () => { unsub(); document.removeEventListener('keydown', onKey); };
}
