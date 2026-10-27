// Tabula · pantalla "Hoy": el resumen del día

import { store } from '../store.js';
import { h, icon, longDate, greeting, todayISO, relativeDay, toast } from '../ui.js';
import { getSessionsForDate, getEventsForDate, getGroup, getAttendance, sessionLabel, areaShort, toMin, EVENT_TYPES } from '../school.js';
import { getPrograms } from '../programs.js';
import { matchProgramForSession, isCoordSession } from './programas/common.js';
import { parseQuickInput, createTask, sortTasks, taskRow, isOverdue } from '../tasks-model.js';

export function render(container) {
  const profile = store.getSetting('profile', { nombre: '' });
  const firstName = (profile.nombre || '').trim().split(/\s+/)[0];

  // --- Captura rápida ---
  const input = h('input', {
    id: 'hoy-captura', type: 'text', autocomplete: 'off',
    placeholder: 'Añadir tarea… ej. «llamar a una familia mañana»',
  });
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    const parsed = parseQuickInput(text);
    createTask(parsed);
    input.value = '';
    toast(parsed.due ? `Añadida para ${relativeDay(parsed.due).toLowerCase()}` : 'Tarea añadida');
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const composer = h('div', { class: 'composer' },
    h('label', { class: 'sr-only', for: 'hoy-captura' }, 'Añadir tarea'), input,
    h('button', { class: 'send', 'aria-label': 'Añadir tarea', onclick: add }, icon('plus', 18)));

  // --- Tarjeta de tareas (se refresca sola) ---
  const tasksBody = h('div');
  const tasksCount = h('span', { class: 'eyebrow' });
  const tasksCard = h('section', { class: 'card', 'aria-labelledby': 'hoy-tareas-t' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title', id: 'hoy-tareas-t' }, 'Tareas de hoy'),
      h('a', { class: 'link-btn', href: '#/tareas' }, 'Ver todas')),
    tasksBody);

  function paintTasks() {
    const today = todayISO();
    const all = store.list('tasks');
    const pending = sortTasks(all.filter((t) => !t.done && t.due && t.due <= today));
    const doneToday = all.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString());
    const overdue = pending.filter(isOverdue).length;
    const upcoming = all.filter((t) => !t.done && t.due && t.due > today).length;

    tasksCount.textContent = pending.length
      ? `${pending.length} para hoy${overdue ? ` · ${overdue} vencida${overdue > 1 ? 's' : ''}` : ''}`
      : 'Todo al día';

    if (!pending.length && !doneToday.length) {
      tasksBody.replaceChildren(h('div', { class: 'empty' }, icon('tareas', 36),
        h('strong', {}, 'Nada pendiente para hoy'),
        upcoming ? `Tienes ${upcoming} tarea${upcoming > 1 ? 's' : ''} para los próximos días.` : 'Escribe arriba para añadir la primera.'));
      return;
    }
    const list = h('ul', { class: 'task-list' },
      ...pending.map((t) => taskRow(t, { compact: true, showDate: isOverdue(t) })),
      ...sortTasks(doneToday).map((t) => taskRow(t, { compact: true, showDate: false })));
    tasksBody.replaceChildren(list);
  }

  // --- Horario de hoy (sesión en curso destacada) ---
  const scheduleBody = h('div');
  const scheduleCard = h('section', { class: 'card', 'aria-labelledby': 'hoy-horario-t' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title', id: 'hoy-horario-t' }, 'Horario de hoy'),
      h('a', { class: 'link-btn', href: '#/calendario?vista=semana' }, 'Semana')),
    scheduleBody);

  // Botón «Anotar» para sesiones «otro» que corresponden a un programa (o contienen «coord»)
  function programButton(s) {
    if (s.tipo !== 'otro') return null;
    const programs = getPrograms();
    const match = matchProgramForSession(s, programs);
    if (!match && !isCoordSession(s)) return null;
    const mins = toMin(s.fin) - toMin(s.inicio);
    return h('button', {
      type: 'button', class: 'btn btn-sm',
      'aria-label': match ? `Anotar en el diario de ${match.nombre}` : 'Anotar en el diario de un programa',
      onclick: () => import('./programas/quick.js').then((m) => m.openQuickEntry({ programaId: match ? match.id : undefined, duracionMin: mins > 0 ? mins : undefined })),
    }, 'Anotar');
  }

  function paintSchedule() {
    const today = todayISO();
    const sessions = getSessionsForDate(today);
    const events = getEventsForDate(today);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const items = [];

    // Eventos del día (reuniones, evaluaciones, festivos…)
    events.forEach((e) => {
      const t = EVENT_TYPES[e.tipo] || EVENT_TYPES.otro;
      items.push(h('a', { class: 'sched-event', href: `#/calendario?vista=semana&fecha=${today}` },
        (e.titulo || '').trim().toLowerCase() === t.label.toLowerCase() ? null : h('span', { class: `chip ${t.color}` }, t.label),
        h('span', { class: 'sched-event-title' }, e.titulo || t.label),
        e.hora ? h('span', { class: 'sched-time' }, e.hora) : null));
    });

    if (!sessions.length) {
      const anySchedule = store.list('schedule').length > 0;
      const wd = now.getDay();
      items.push(h('div', { class: 'empty' }, icon('calendario', 34),
        anySchedule
          ? h('strong', {}, wd === 0 || wd === 6 ? 'Fin de semana: hoy no hay clase' : 'Hoy no tienes sesiones')
          : [h('strong', {}, 'Aún no has creado tu horario'),
            h('a', { class: 'btn', href: '#/calendario?vista=horario', style: { marginTop: '10px' } }, 'Crear horario')]));
      scheduleBody.replaceChildren(...items);
      return;
    }

    const list = h('ul', { class: 'sched-list' });
    const planned = store.list('sesiones').filter((x) => x.fecha === today);
    // Une franjas seguidas de la misma actividad (p. ej. Matemáticas 12:30–13:00–13:30 → 12:30–14:00)
    const blocks = [];
    for (const s of sessions) {
      const last = blocks[blocks.length - 1];
      const same = last && last.fin === s.inicio && last.tipo === s.tipo && (last.area || '') === (s.area || '')
        && (last.groupId || null) === (s.groupId || null) && (last.titulo || '') === (s.titulo || '');
      if (same) { last.fin = s.fin; last.parts.push(s); } else blocks.push({ ...s, parts: [s] });
    }
    blocks.forEach((s) => {
      // Apoyos: "Pili" si cubre todo el bloque; "Pili (9:00–9:30)" si solo una parte
      const apoyos = [...new Set(s.parts.map((p) => p.apoyo).filter(Boolean))].map((name) => {
        const with_ = s.parts.filter((p) => p.apoyo === name);
        return with_.length === s.parts.length ? name : `${name} (${with_[0].inicio}–${with_[with_.length - 1].fin})`;
      });
      // Sesión planificada para este bloque (Planificación)
      const plan = s.tipo === 'clase' ? planned.find((x) => s.parts.some((p) => p.id === x.scheduleId)) : null;
      const current = toMin(s.inicio) <= nowMin && nowMin < toMin(s.fin);
      const past = toMin(s.fin) <= nowMin;
      const group = getGroup(s.groupId);
      const sub = [group && group.nombre, current ? 'Ahora' : null, plan ? plan.titulo : null, s.aula].filter(Boolean).join(' · ');
      const apoyoTag = apoyos.length ? h('span', { class: 'sched-apoyo' }, `Apoyo: ${apoyos.join(', ')}`) : null;
      const mainContent = [
        h('span', { class: 'sched-title' }, s.tipo === 'clase' ? areaShort(s.area) || 'Clase' : sessionLabel(s),
          plan && plan.estado === 'hecha' ? h('span', { class: 'sched-check', 'aria-label': 'Sesión dada' }, icon('check', 14)) : null),
        sub || apoyoTag ? h('span', { class: 'sched-sub' }, sub, sub && apoyoTag ? ' · ' : null, apoyoTag) : null];
      list.append(h('li', { class: `sched-row${current ? ' is-now' : ''}${past ? ' is-past' : ''}${s.tipo !== 'clase' ? ' is-break' : ''}` },
        h('span', { class: 'sched-time' }, s.inicio, s.parts.length > 1 ? h('span', { class: 'sched-end' }, s.fin) : null),
        plan
          ? h('button', { class: 'sched-main sched-open', 'aria-label': `Abrir sesión: ${plan.titulo}`,
            onclick: () => import('./planificacion/session-sheet.js').then((m) => m.openSessionSheet(plan.id)) }, ...mainContent)
          : h('span', { class: 'sched-main' }, ...mainContent),
        // Anecdotario: registro rápido durante la clase en curso
        s.tipo === 'clase' && group && current
          ? h('button', {
            type: 'button', class: 'icon-btn sched-observe', title: 'Observar', 'aria-label': `Registrar observación en ${group.nombre}`,
            onclick: () => import('./anecdotario.js').then((m) => m.openQuickObservation({ groupId: group.id, area: s.area, sesionId: plan ? plan.id : null })),
          }, icon('note', 20))
          : null,
        // Programas: anotar en el diario desde una sesión de coordinación u otra actividad de un programa
        programButton(s),
        s.tipo === 'clase' && group && (current || !past)
          ? (getAttendance(group.id, today)
            ? h('a', { class: 'sched-done', href: `#/grupos?id=${group.id}&tab=asistencia&fecha=${today}`, 'aria-label': `Lista de ${group.nombre} pasada; ver asistencia` }, icon('check', 16), 'Lista')
            : h('a', { class: current ? 'btn btn-sm' : 'icon-btn', href: `#/grupos?id=${group.id}&tab=asistencia&fecha=${today}`, 'aria-label': `Pasar lista de ${group.nombre}` },
              current ? 'Pasar lista' : icon('grupos', 18)))
          : null));
    });
    items.push(list);
    scheduleBody.replaceChildren(...items);
  }

  const soonCard = (title, iconName, text) => h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, title), h('span', { class: 'soon' }, 'Próximamente')),
    h('div', { class: 'empty' }, icon(iconName, 34), text));

  container.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'eyebrow' }, longDate(), ' · ', tasksCount),
        h('h1', { class: 'page-title' }, firstName ? `${greeting()}, ${firstName}` : greeting())),
      composer),
    h('div', { class: 'today-grid' },
      h('div', { class: 'today-col' }, scheduleCard),
      h('div', { class: 'today-col' },
        tasksCard,
        soonCard('Para imprimir hoy', 'printer', 'Aquí aparecerán las fichas y documentos que programes para imprimir cada día.'))),
  );

  const paintAll = () => { paintTasks(); paintSchedule(); };
  paintAll();
  const unsubs = ['tasks', 'schedule', 'events', 'groups', 'sesiones', 'attendance', 'programas'].map((c) => store.subscribe(c, c === 'tasks' ? paintTasks : paintSchedule));
  const tick = setInterval(paintAll, 60_000); // sesión en curso y cambio de día
  return () => { unsubs.forEach((u) => u()); clearInterval(tick); };
}
