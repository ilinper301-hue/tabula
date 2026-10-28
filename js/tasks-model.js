// Tabula · módulo Tareas · modelo, análisis de texto rápido, fila reutilizable y editor
import { store, uid } from './store.js';
import { asistenteChip } from './asistente-mark.js';
import {
  h, icon, toast, openSheet, todayISO, addDaysISO, relativeDay, toISO, tagClass,
} from './ui.js';

const COL = 'tasks';

/* ======================================================================
   Análisis de lenguaje natural («corregir dictado mañana #lengua !»)
   ====================================================================== */

const WEEKDAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WD = 'lunes|martes|miercoles|jueves|viernes|sabado|domingo';
const MES =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|' +
  'ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic';
const B = '(?<![\\p{L}\\d])';      // inicio de palabra
const E = '(?![\\p{L}\\d])';       // fin de palabra

/** Minúsculas y sin acentos, manteniendo EXACTAMENTE la misma longitud que el original. */
const fold = (s) => s.split('').map((c) => c.normalize('NFD')[0].toLowerCase()[0] || c).join('');

const pad = (n) => String(n).padStart(2, '0');

/** Crea una fecha local validando que el día exista (31/2 → null). */
function makeDate(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

/** Fecha sin año: si ya pasó este año, usa el siguiente. */
function resolveNoYear(today, m, d) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let dt = makeDate(t0.getFullYear(), m, d);
  if (dt && dt < t0) dt = makeDate(t0.getFullYear() + 1, m, d);
  return dt;
}

/**
 * Interpreta texto libre en español.
 * @param {string} text
 * @param {Date} [today] - se puede fijar para pruebas deterministas
 * @returns {{title:string, due:string|null, time:string|null, tags:string[], priority:0|1}}
 */
export function parseQuickInput(text, today = new Date()) {
  const original = String(text ?? '');
  let orig = original;
  let norm = fold(original);
  let matched = false;
  const out = { title: '', due: null, time: null, tags: [], priority: 0 };

  // Sustituye un tramo por espacios en ambas cadenas (misma longitud).
  const blank = (a, b) => {
    const sp = ' '.repeat(b - a);
    orig = orig.slice(0, a) + sp + orig.slice(b);
    norm = norm.slice(0, a) + sp + norm.slice(b);
    matched = true;
  };
  // Busca la primera coincidencia válida; fn devuelve undefined/null si no es válida.
  const grab = (re, fn) => {
    for (const m of norm.matchAll(re)) {
      const r = fn(m);
      if (r !== undefined && r !== null) { blank(m.index, m.index + m[0].length); return r; }
    }
    return null;
  };
  const addDays = (n) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() + n);
    return toISO(d);
  };

  // 1) Etiquetas #lengua (todas)
  for (;;) {
    const tag = grab(/(?<![\p{L}\d])#([\p{L}\d-]+)/gu, (m) => orig.slice(m.index + 1, m.index + m[0].length).toLowerCase());
    if (!tag) break;
    if (!out.tags.includes(tag)) out.tags.push(tag);
  }

  // 2) Prioridad: «!» o «!!» como palabra suelta
  if (grab(/(?<!\S)!{1,2}(?!\S)/g, () => true)) out.priority = 1;

  // 3) Hora: 16:30 · a las 16 · 16h · 16h30
  const okTime = (h24, mi) => (h24 < 24 && mi < 60 ? `${pad(h24)}:${pad(mi)}` : null);
  out.time =
    grab(/(?<![\d/:-])(?:a\s+las?\s+)?(\d{1,2}):(\d{2})(?![\d:/])/gu, (m) => okTime(+m[1], +m[2])) ||
    grab(/(?<![\p{L}\d/:-])a\s+las?\s+(\d{1,2})(?:[:h](\d{2}))?(?:h(?:oras?)?)?(?![\p{L}\d/:])/gu, (m) => okTime(+m[1], +(m[2] || 0))) ||
    grab(/(?<![\d/:-])(\d{1,2})h(\d{2})?(?![\p{L}\d])/gu, (m) => okTime(+m[1], +(m[2] || 0)));

  // 4) Fecha (la primera que se encuentre manda)
  // 4a) numérica: 3/11, 3-11, 3/11/2026
  out.due = grab(
    /(?<![\p{L}\d/:.-])(?:el\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?(?![\d/:.-]|\p{L})/gu,
    (m) => {
      const d = +m[1], mo = +m[2];
      const dt = m[3] ? makeDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, d) : resolveNoYear(today, mo, d);
      return dt ? toISO(dt) : null;
    });
  // 4b) textual: 3 nov, 3 de noviembre (de 2027)
  if (!out.due) {
    out.due = grab(new RegExp(`${B}(?:el\\s+)?(\\d{1,2})\\s+(?:de\\s+)?(${MES})${E}(?:\\s+(?:de\\s+)?(\\d{4})${E})?`, 'gu'), (m) => {
      const key = m[2].slice(0, 3) === 'set' ? 'sep' : m[2].slice(0, 3);
      const mo = MONTHS.indexOf(key) + 1;
      const dt = m[3] ? makeDate(+m[3], mo, +m[1]) : resolveNoYear(today, mo, +m[1]);
      return dt ? toISO(dt) : null;
    });
  }
  // 4c) relativas
  const rel = (re, fn) => { if (!out.due) out.due = grab(new RegExp(re, 'gu'), fn); };
  rel(`${B}pasado\\s+manana${E}`, () => addDays(2));
  rel(`${B}(?:(?:la\\s+)?proxima\\s+semana|(?:la\\s+)?semana\\s+que\\s+viene)${E}`, () => addDays((1 - today.getDay() + 7) % 7 || 7));
  rel(`${B}hoy${E}`, () => addDays(0));
  rel(`${B}ayer${E}`, () => addDays(-1));
  rel(`${B}manana${E}`, () => addDays(1));
  rel(`${B}(?:(?:el|este|proximo)\\s+)*(${WD})${E}`, (m) => addDays((WEEKDAYS[m[1]] - today.getDay() + 7) % 7 || 7));

  // Título: lo que queda, sin espacios sobrantes ni conectores colgando
  let title = orig.replace(/\s+/g, ' ').trim();
  if (matched) {
    title = title.replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');
    title = title.replace(/\s+(?:para|el|la|de|del|a|antes de|hasta|este|en)$/i, '').trim();
  }
  out.title = title || original.trim();
  return out;
}

/* ======================================================================
   Operaciones sobre tareas
   ====================================================================== */

/** Crea una tarea rellenando los valores por defecto. */
export function createTask(fields = {}) {
  return store.add(COL, {
    title: '', notes: '', due: null, time: null, priority: 0, tags: [], subtasks: [],
    done: false, doneAt: null,
    ...fields,
  });
}

/** Marca/desmarca como hecha. Al completar ofrece «Deshacer». */
export function toggleTask(id) {
  const t = store.get(COL, id);
  if (!t) return;
  if (!t.done) {
    store.update(COL, id, { done: true, doneAt: Date.now() });
    toast('Tarea completada', {
      label: 'Deshacer',
      run: () => store.update(COL, id, { done: false, doneAt: null }),
    });
  } else {
    store.update(COL, id, { done: false, doneAt: null });
  }
}

/** Elimina con posibilidad de deshacer. */
export function deleteTask(id) {
  const removed = store.remove(COL, id);
  if (!removed) return;
  toast('Tarea eliminada', { label: 'Deshacer', run: () => store.restore(COL, removed) });
}

export const isOverdue = (t) => !t.done && !!t.due && t.due < todayISO();

/** Orden: pendientes primero; fecha asc (sin fecha al final); importantes; hora; creación. */
export function sortTasks(arr) {
  const nullLast = (a, b) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : 1);
  return [...arr].sort((a, b) =>
    (a.done - b.done) ||
    nullLast(a.due, b.due) ||
    ((b.priority || 0) - (a.priority || 0)) ||
    nullLast(a.time, b.time) ||
    ((a.createdAt || 0) - (b.createdAt || 0)));
}

/** Etiquetas únicas ordenadas de todas las tareas. */
export function allTags() {
  const set = new Set();
  store.list(COL).forEach((t) => (t.tags || []).forEach((x) => set.add(x)));
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

/* ======================================================================
   Fila de tarea (reutilizada en «Hoy»)
   ====================================================================== */

export function taskRow(task, { compact = false, showDate = true } = {}) {
  const overdue = isOverdue(task);
  const subs = task.subtasks || [];
  const subsDone = subs.filter((s) => s.done).length;

  const meta = [];
  if (task.due && showDate) {
    meta.push(h('span', { class: `task-date${overdue ? ' overdue' : ''}` },
      overdue ? h('span', { class: 'sr-only' }, 'Vencida: ') : null, relativeDay(task.due)));
  }
  if (task.time) meta.push(h('span', { class: 'task-time' }, icon('clock', 13), task.time));
  if (task.priority) meta.push(h('span', { class: 'task-flag', title: 'Importante' }, icon('flag', 14), h('span', { class: 'sr-only' }, 'Importante')));
  if (subs.length) {
    meta.push(h('span', { class: 'task-subs', title: `${subsDone} de ${subs.length} subtareas` }, icon('check', 13), `${subsDone}/${subs.length}`));
  }
  (task.tags || []).forEach((t) => meta.push(h('span', { class: `chip ${tagClass(t)}` }, t)));
  const mark = asistenteChip(task);
  if (mark) meta.push(mark);

  const firstNote = !compact && task.notes ? task.notes.split('\n').find((l) => l.trim()) : '';

  const open = () => openTaskEditor(task.id);
  return h('li', { class: `task-row${compact ? ' compact' : ''}${task.done ? ' is-done' : ''}`, dataset: { id: task.id } },
    h('label', { class: 'task-check' },
      h('input', {
        type: 'checkbox', class: 'check', checked: !!task.done,
        'aria-label': `Completar: ${task.title}`,
        onchange: () => toggleTask(task.id),
      })),
    h('div', {
      class: 'task-body', role: 'button', tabindex: '0',
      'aria-label': `Editar tarea: ${task.title}`,
      onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
    },
      h('div', { class: 'task-title' }, task.title),
      firstNote ? h('div', { class: 'task-notes' }, firstNote) : null,
      meta.length ? h('div', { class: 'task-meta' }, meta) : null));
}

/* ======================================================================
   Editor (hoja lateral / inferior)
   ====================================================================== */

/** Convierte «Lengua, #Examen  mates» en ['lengua','examen','mates']. */
function parseTagList(str) {
  const tags = String(str).split(/[,\s]+/)
    .map((t) => t.replace(/^#+/, '').toLowerCase().replace(/[^\p{L}\d-]/gu, ''))
    .filter(Boolean);
  return [...new Set(tags)];
}

export function openTaskEditor(id) {
  const task = store.get(COL, id);
  if (!task) return null;
  return openForm('Editar tarea', task);
}

export function openNewTask(prefill = {}) {
  return openForm('Nueva tarea', null, prefill);
}

function openForm(sheetTitle, task, prefill = {}) {
  const isNew = !task;
  const base = {
    title: '', notes: '', due: null, time: null, priority: 0, tags: [], subtasks: [],
    ...(task || prefill),
  };
  let priority = base.priority ? 1 : 0;
  let subtasks = (base.subtasks || []).map((s) => ({ ...s }));
  let close = () => {};

  // --- Campos
  const title = h('input', { class: 'input', id: 'te-title', value: base.title, placeholder: '¿Qué hay que hacer?', required: true, autocomplete: 'off' });
  const notes = h('textarea', { class: 'textarea', id: 'te-notes', placeholder: 'Detalles, enlaces, materiales…' });
  notes.value = base.notes || '';
  const due = h('input', { class: 'input', id: 'te-due', type: 'date', value: base.due || '' });
  const time = h('input', { class: 'input', id: 'te-time', type: 'time', value: base.time || '' });
  const setDue = (v) => { due.value = v || ''; };

  const prio = h('button', {
    type: 'button', class: 'btn prio-toggle', 'aria-pressed': String(!!priority),
    onclick: () => { priority = priority ? 0 : 1; prio.setAttribute('aria-pressed', String(!!priority)); },
  }, icon('flag', 16), 'Importante');

  // --- Etiquetas con vista previa en chips
  const tagsPreview = h('div', { class: 'te-chips' });
  const tagsInput = h('input', {
    class: 'input', id: 'te-tags', value: (base.tags || []).join(', '), placeholder: 'lengua, examen', autocomplete: 'off',
    oninput: () => paintTags(),
  });
  const paintTags = () => {
    tagsPreview.replaceChildren(...parseTagList(tagsInput.value).map((t) => h('span', { class: `chip ${tagClass(t)}` }, t)));
  };
  paintTags();

  // --- Subtareas
  const subList = h('ul', { class: 'te-subs' });
  const subInput = h('input', {
    class: 'input', id: 'te-sub', placeholder: 'Añadir subtarea y pulsar Intro', autocomplete: 'off',
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } },
  });
  const addSub = () => {
    const t = subInput.value.trim();
    if (!t) return;
    subtasks.push({ id: uid(), title: t, done: false });
    subInput.value = '';
    paintSubs();
    subInput.focus();
  };
  const paintSubs = () => {
    subList.replaceChildren(...subtasks.map((s) => h('li', { class: `te-sub${s.done ? ' is-done' : ''}` },
      h('label', { class: 'task-check' },
        h('input', {
          type: 'checkbox', class: 'check', checked: !!s.done, 'aria-label': `Subtarea hecha: ${s.title}`,
          onchange: (e) => { s.done = e.target.checked; paintSubs(); },
        })),
      h('span', { class: 'te-sub-title' }, s.title),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `Eliminar subtarea: ${s.title}`,
        onclick: () => { subtasks = subtasks.filter((x) => x !== s); paintSubs(); },
      }, icon('trash', 18)))));
  };
  paintSubs();

  // --- Guardar
  const save = (e) => {
    e && e.preventDefault();
    const t = title.value.trim();
    if (!t) { title.focus(); title.setAttribute('aria-invalid', 'true'); toast('Escribe un título para la tarea'); return; }
    const pending = subInput.value.trim();
    if (pending) subtasks.push({ id: uid(), title: pending, done: false });
    const data = {
      title: t,
      notes: notes.value.trim(),
      due: due.value || null,
      time: time.value || null,
      priority,
      tags: parseTagList(tagsInput.value),
      subtasks,
    };
    if (isNew) createTask({ ...prefill, ...data });
    else store.update(COL, task.id, data);
    close();
  };

  const form = h('form', { class: 'te-form', novalidate: true, onsubmit: save },
    h('div', { class: 'field' }, h('label', { for: 'te-title' }, 'Título'), title),
    h('div', { class: 'field' }, h('label', { for: 'te-notes' }, 'Notas'), notes),
    h('div', { class: 'field' },
      h('label', { for: 'te-due' }, 'Fecha'),
      h('div', { class: 'te-row' }, due,
        h('div', { class: 'te-quick' },
          h('button', { type: 'button', class: 'btn', onclick: () => setDue(todayISO()) }, 'Hoy'),
          h('button', { type: 'button', class: 'btn', onclick: () => setDue(addDaysISO(todayISO(), 1)) }, 'Mañana'),
          h('button', { type: 'button', class: 'btn', onclick: () => setDue('') }, 'Sin fecha')))),
    h('div', { class: 'te-row2' },
      h('div', { class: 'field' }, h('label', { for: 'te-time' }, 'Hora'), time),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Prioridad'), prio)),
    h('div', { class: 'field' },
      h('label', { for: 'te-tags' }, 'Etiquetas (separadas por comas)'), tagsInput, tagsPreview),
    h('div', { class: 'field' },
      h('label', { for: 'te-sub' }, 'Subtareas'), subList, subInput),
    h('div', { class: 'te-foot' },
      isNew ? h('span') : h('button', {
        type: 'button', class: 'btn btn-ghost btn-danger',
        onclick: () => { deleteTask(task.id); close(); },
      }, icon('trash', 16), 'Eliminar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar')));

  close = openSheet(sheetTitle, form);
  setTimeout(() => title.focus(), 60);
  return close;
}
