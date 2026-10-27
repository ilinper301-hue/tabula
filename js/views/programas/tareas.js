// Tabula · Planes y programas · pestaña Tareas (tareas con la etiqueta del programa + reuniones/eventos)
import { store } from '../../store.js';
import { h, icon, toast, openSheet, todayISO, fromISO, MESES, DIAS } from '../../ui.js';
import { programTasks, programEvents } from '../../programs.js';
import { parseQuickInput, createTask, sortTasks, taskRow } from '../../tasks-model.js';
import { EVENT_TYPES } from '../../school.js';
import { field, safePainter, cap } from './common.js';

let doneOpen = false;
let pastOpen = false;

export function mountTareas(panel, programaId) {
  const prog = () => store.get('programas', programaId);

  // --- Alta rápida de tarea (se añade la etiqueta del programa automáticamente)
  const input = h('input', {
    type: 'text', id: 'pg-task-add', autocomplete: 'off', 'aria-label': 'Nueva tarea del programa',
    placeholder: 'Nueva tarea… ej. «preparar kits de robótica el viernes»',
  });
  const add = () => {
    const text = input.value.trim();
    const p = prog();
    if (!text || !p) return;
    const parsed = parseQuickInput(text);
    createTask({ ...parsed, tags: [...new Set([...(parsed.tags || []), p.etiqueta])] });
    input.value = ''; input.focus();
    toast('Tarea añadida');
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const composer = h('div', { class: 'composer pg-task-composer' }, input,
    h('button', { type: 'button', class: 'send', 'aria-label': 'Añadir tarea', onclick: add }, icon('plus', 18)));

  const tasksBody = h('div');
  const tasksCard = h('section', { class: 'card pg-list-card', 'aria-labelledby': 'pg-tareas-t' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title', id: 'pg-tareas-t' }, 'Tareas'),
      h('span', { class: 'chip t1 pg-tagchip' }, `#${prog()?.etiqueta || ''}`)),
    composer, tasksBody);

  const eventsBody = h('div');
  const eventsCard = h('section', { class: 'card pg-list-card', 'aria-labelledby': 'pg-eventos-t' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title', id: 'pg-eventos-t' }, 'Reuniones y fechas'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => openMeetingSheet(programaId) }, icon('plus', 15), 'Nueva reunión')),
    eventsBody);

  panel.replaceChildren(h('div', { class: 'pg-stack' }, tasksCard, eventsCard));

  function paintTasks() {
    const p = prog();
    if (!p) return;
    const all = programTasks(p);
    const pending = sortTasks(all.filter((t) => !t.done));
    const done = sortTasks(all.filter((t) => t.done)).reverse();
    const parts = [];
    parts.push(pending.length
      ? h('ul', { class: 'task-list' }, pending.map((t) => taskRow(t)))
      : h('div', { class: 'empty pg-empty-s' }, all.length ? 'Todo al día en este programa.' : `Aún no hay tareas con #${p.etiqueta}. Escribe arriba la primera.`));
    if (done.length) {
      parts.push(h('div', { class: 'tareas-completed' },
        h('button', {
          type: 'button', class: 'completed-toggle', 'aria-expanded': String(doneOpen),
          onclick: () => { doneOpen = !doneOpen; paintTasks(); },
        }, icon(doneOpen ? 'chevronDown' : 'chevronRight', 16), `Completadas (${done.length})`),
        doneOpen ? h('ul', { class: 'task-list' }, done.map((t) => taskRow(t))) : null));
    }
    tasksBody.replaceChildren(...parts);
  }

  const evLabel = (iso) => {
    const d = fromISO(iso);
    return `${cap(DIAS[d.getDay()]).slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
  };
  function evRow(e) {
    const t = EVENT_TYPES[e.tipo] || EVENT_TYPES.otro;
    return h('li', { class: 'pg-event' },
      h('a', { class: 'pg-event-link', href: `#/calendario?vista=semana&fecha=${e.fecha}` },
        h('span', { class: 'pg-event-date' }, evLabel(e.fecha), e.hora ? h('small', {}, e.hora) : null),
        h('span', { class: 'pg-event-title' }, e.titulo || t.label),
        h('span', { class: `chip ${t.color}` }, t.label)));
  }
  function paintEvents() {
    const p = prog();
    if (!p) return;
    const today = todayISO();
    const evs = programEvents(p);
    const upcoming = evs.filter((e) => (e.fechaFin || e.fecha) >= today);
    const past = evs.filter((e) => (e.fechaFin || e.fecha) < today).reverse();
    const parts = [];
    parts.push(upcoming.length
      ? h('div', {}, h('h3', { class: 'section-label' }, 'Próximas'), h('ul', { class: 'pg-events' }, upcoming.map(evRow)))
      : h('div', { class: 'empty pg-empty-s' }, evs.length ? 'No hay reuniones próximas.' : 'Aún no hay reuniones. Crea una y aparecerá también en el Calendario.'));
    if (past.length) {
      parts.push(h('div', { class: 'tareas-completed' },
        h('button', { type: 'button', class: 'completed-toggle', 'aria-expanded': String(pastOpen), onclick: () => { pastOpen = !pastOpen; paintEvents(); } },
          icon(pastOpen ? 'chevronDown' : 'chevronRight', 16), `Pasadas (${past.length})`),
        pastOpen ? h('ul', { class: 'pg-events' }, past.map(evRow)) : null));
    }
    eventsBody.replaceChildren(...parts);
  }

  paintTasks(); paintEvents();
  const unsubs = [
    store.subscribe('tasks', safePainter(tasksBody, paintTasks)),
    store.subscribe('events', safePainter(eventsBody, paintEvents)),
    store.subscribe('programas', () => { const p = prog(); if (p) { tasksCard.querySelector('.pg-tagchip').textContent = `#${p.etiqueta}`; paintTasks(); } }),
  ];
  return () => unsubs.forEach((u) => u());
}

/** Hoja pequeña para crear una reunión del programa (evento del calendario con programaId). */
export function openMeetingSheet(programaId, { onSaved } = {}) {
  const p = store.get('programas', programaId);
  if (!p) return null;
  const titulo = h('input', { class: 'input', type: 'text', maxlength: 120, autocomplete: 'off', placeholder: `Ej.: Reunión de ${p.nombre}`, value: '' });
  const fecha = h('input', { class: 'input', type: 'date', value: todayISO() });
  const hora = h('input', { class: 'input', type: 'time', value: '' });
  const error = h('p', { class: 'pg-error', role: 'alert', hidden: true });
  const submit = (e) => {
    e.preventDefault();
    const t = titulo.value.trim() || `Reunión de ${p.nombre}`;
    if (!fecha.value) { error.textContent = 'Elige una fecha.'; error.hidden = false; fecha.focus(); return; }
    const ev = store.add('events', {
      titulo: t, fecha: fecha.value, fechaFin: null, hora: hora.value || null,
      tipo: 'reunion', groupId: null, notas: '', programaId: p.id,
    });
    close();
    toast('Reunión añadida al calendario');
    onSaved && onSaved(ev);
  };
  const form = h('form', { class: 'pg-form', novalidate: true, onsubmit: submit },
    field('Título', titulo),
    h('div', { class: 'pg-two' }, field('Fecha', fecha), field('Hora (opcional)', hora)),
    error,
    h('div', { class: 'pg-actions' }, h('span', { class: 'pg-spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Crear reunión')));
  const close = openSheet('Nueva reunión', form);
  setTimeout(() => titulo.focus(), 80);
  return close;
}
