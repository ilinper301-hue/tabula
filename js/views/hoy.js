// Tabula · pantalla "Hoy": el resumen del día

import { store } from '../store.js';
import { h, icon, longDate, greeting, todayISO, relativeDay, toast } from '../ui.js';
import { getSessionsForDate, getEventsForDate, getGroup, getAttendance, sessionLabel, areaShort, toMin, EVENT_TYPES } from '../school.js';
import { getPrograms } from '../programs.js';
import { matchProgramForSession, isCoordSession } from './programas/common.js';
import { dueNow, canPrint } from '../documents.js';
import { splitReuniones, reviewsDue, TIPOS_REUNION, MEDIDAS } from '../tutoria.js';
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
    scheduleBody,
    h('div', { class: 'su-hoy-foot' },
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost su-hoy-btn', onclick: () => import('./sustituto.js').then((m) => m.openSustituto()) }, icon('note', 16), 'Plan para el sustituto')));

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

  // Clip con el número de documentos de la sesión: abre el documento (o la sesión si hay varios)
  function docClip(plan) {
    const ids = plan.documentoIds.filter((id) => store.get('documentos', id));
    const label = `${ids.length} documento${ids.length === 1 ? '' : 's'} adjunto${ids.length === 1 ? '' : 's'}`;
    return ids.length === 1
      ? h('a', { class: 'dc-clip', href: `#/documentos?doc=${ids[0]}`, 'aria-label': label, title: label }, icon('paperclip', 16), '1')
      : h('button', { type: 'button', class: 'dc-clip', 'aria-label': label, title: label,
        onclick: () => import('./planificacion/session-sheet.js').then((m) => m.openSessionSheet(plan.id)) }, icon('paperclip', 16), String(ids.length));
  }

  // «Evaluar»: abre la evaluación rápida del grupo y área de la sesión (destacada si es la clase en curso)
  function evalButton(s, group, plan, current) {
    const open = () => import('./aula/evaluar.js').then((m) => m.openQuickEval({ groupId: group.id, area: s.area, sesionId: plan ? plan.id : null }));
    const label = `Evaluar ${areaShort(s.area)} con ${group.nombre}`;
    return current
      ? h('button', { type: 'button', class: 'btn btn-sm au-eval', 'aria-label': label, title: 'Evaluar', onclick: open }, icon('check', 18), h('span', { class: 'au-eval-lbl' }, 'Evaluar'))
      : h('button', { type: 'button', class: 'icon-btn au-eval', title: 'Evaluar', 'aria-label': label, onclick: open }, icon('check', 20));
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
        // Evaluación rápida (niveles por criterio) durante o después de la clase
        s.tipo === 'clase' && group && s.area ? evalButton(s, group, plan, current) : null,
        // Documentos adjuntos a la sesión planificada
        plan && (plan.documentoIds || []).filter((id) => store.get('documentos', id)).length ? docClip(plan) : null,
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

  // --- Para imprimir hoy (Documentos): solo aparece si hay algo pendiente ---
  const printBody = h('ul', { class: 'dc-mini-list' });
  const printCard = h('section', { class: 'card', 'aria-labelledby': 'hoy-imprimir-t', hidden: true },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title', id: 'hoy-imprimir-t' }, 'Para imprimir hoy'),
      h('a', { class: 'link-btn', href: '#/documentos?tab=imprimir' }, 'Ver cola')),
    printBody);
  function paintPrint() {
    const docs = Object.fromEntries(store.list('documentos').map((d) => [d.id, d]));
    const due = dueNow(store.list('impresiones'), todayISO()).filter((i) => docs[i.documentoId])
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.createdAt || 0) - (b.createdAt || 0));
    printCard.hidden = !due.length;
    if (!due.length) { printBody.replaceChildren(); return; }
    const rows = due.slice(0, 3).map((it) => {
      const d = docs[it.documentoId];
      const printable = canPrint(d);
      return h('li', { class: 'dc-mini' },
        h('div', { class: 'dc-mini-text' },
          h('a', { class: 'dc-mini-title', href: `#/documentos?doc=${d.id}`, style: { color: 'inherit', textDecoration: 'none' } }, d.titulo),
          h('span', { class: 'dc-mini-sub' }, `${it.copias || 1} ${(it.copias || 1) === 1 ? 'copia' : 'copias'}${it.dobleCara ? ' · doble cara' : ''}${it.fecha < todayISO() ? ' · atrasado' : ''}`)),
        h('button', {
          type: 'button', class: 'btn btn-sm', 'aria-label': `Imprimir ${d.titulo}`,
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            const m = await import('./documentos/common.js');
            await m.printItem(it);
            paintPrint();
          },
        }, icon(printable ? 'printer' : 'external', 15), printable ? 'Imprimir' : 'Abrir'));
    });
    printBody.replaceChildren(...rows, ...(due.length > 3 ? [h('li', { class: 'dc-mini-more' }, `y ${due.length - 3} más en la cola`)] : []));
  }

  // --- Tutoría: reuniones de hoy, reuniones sin cerrar y revisiones de medidas (solo si hay algo) ---
  const tutBody = h('div');
  const tutCard = h('section', { class: 'card', 'aria-labelledby': 'hoy-tutoria-t', hidden: true },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title', id: 'hoy-tutoria-t' }, 'Tutoría'),
      h('a', { class: 'link-btn', href: '#/tutoria' }, 'Abrir')),
    tutBody);
  function paintTutoria() {
    const today = todayISO();
    const byId = Object.fromEntries(store.list('students').map((x) => [x.id, x]));
    const names = (r) => {
      const n = (r.studentIds || []).map((id) => byId[id]?.nombre).filter(Boolean);
      return n.length ? n.slice(0, 3).join(', ') + (n.length > 3 ? ` y ${n.length - 3} más` : '') : (TIPOS_REUNION[r.tipo] || 'Reunión');
    };
    const { proximas, sinCerrar } = splitReuniones(store.list('reuniones'), today);
    const hoy = proximas.filter((r) => r.fecha === today);
    const due = reviewsDue(store.list('medidas'), today);
    const sections = [];
    const MAX = 3;
    const more = (n) => (n > MAX ? h('li', { class: 'au-tut-more' }, `y ${n - MAX} más`) : null);
    if (hoy.length) {
      sections.push(h('div', { class: 'au-tut-group' }, h('div', { class: 'section-label' }, 'Reuniones de hoy'),
        h('ul', { class: 'au-tut-list' }, ...hoy.slice(0, MAX).map((r) => h('li', {}, h('a', { class: 'au-tut-item', href: `#/tutoria?reunion=${r.id}` },
          h('span', { class: 'au-tut-time' }, r.hora || '—'),
          h('span', { class: 'au-tut-main' }, h('span', { class: 'au-tut-title' }, names(r)), h('span', { class: 'au-tut-meta' }, TIPOS_REUNION[r.tipo] || 'Reunión')))))), more(hoy.length)));
    }
    if (sinCerrar.length) {
      sections.push(h('div', { class: 'au-tut-group' }, h('div', { class: 'section-label alert' }, 'Sin cerrar'),
        h('ul', { class: 'au-tut-list' }, ...sinCerrar.slice(0, MAX).map((r) => h('li', {}, h('a', { class: 'au-tut-item', href: `#/tutoria?reunion=${r.id}` },
          h('span', { class: 'au-tut-main' }, h('span', { class: 'au-tut-title' }, names(r)), h('span', { class: 'au-tut-meta' }, `${relativeDay(r.fecha)}${r.hora ? ` · ${r.hora}` : ''}`)),
          h('span', { class: 'au-tut-act' }, 'Anotar resumen'))))), more(sinCerrar.length)));
    }
    if (due.length) {
      sections.push(h('div', { class: 'au-tut-group' }, h('div', { class: 'section-label' }, 'Revisión de medidas'),
        h('ul', { class: 'au-tut-list' }, ...due.slice(0, MAX).map((m) => h('li', {}, h('a', { class: 'au-tut-item', href: '#/tutoria?tab=diversidad' },
          h('span', { class: 'au-tut-main' }, h('span', { class: 'au-tut-title' }, byId[m.studentId]?.nombre || 'Alumno/a'),
            h('span', { class: 'au-tut-meta' }, `${(MEDIDAS[m.tipo]?.label || 'Medida').replace(/ \(.*$/, '')} · ${m.revision < today ? 'revisión vencida' : m.revision === today ? 'revisión hoy' : `revisión ${relativeDay(m.revision).toLowerCase()}`}`)))))), more(due.length)));
    }
    tutCard.hidden = !sections.length;
    tutBody.replaceChildren(...sections);
  }

  // --- Bandeja del asistente: solo aparece si hay apuntes por revisar o un dispositivo pendiente ---
  const asistenteSlot = h('div', { class: 'hy-as-slot' });
  let alive = true, asistenteOff = null;
  import('./bandeja.js').then((m) => { if (alive) asistenteOff = m.mountHoyCard(asistenteSlot); }).catch(() => {});

  container.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'eyebrow' }, longDate(), ' · ', tasksCount),
        h('div', { class: 'au-hoy-title' },
          h('h1', { class: 'page-title' }, firstName ? `${greeting()}, ${firstName}` : greeting()),
          h('a', { class: 'btn btn-sm au-hoy-link', href: '#/aula', 'aria-label': 'Abrir En clase: herramientas del aula' }, icon('aula', 17), 'En clase'),
          h('button', { type: 'button', class: 'btn btn-sm au-hoy-link', id: 'hoy-dictar', 'aria-label': 'Dictar a Tabula tareas, eventos, observaciones o tutorías', onclick: () => import('./voz.js').then((m) => m.openVoz()) }, icon('mic', 17), 'Dictar'))),
      composer),
    asistenteSlot,
    h('div', { class: 'today-grid' },
      h('div', { class: 'today-col' }, scheduleCard, tutCard),
      h('div', { class: 'today-col' },
        tasksCard,
        printCard)),
  );

  const paintAll = () => { paintTasks(); paintSchedule(); paintPrint(); paintTutoria(); };
  paintAll();
  const unsubs = ['tasks', 'schedule', 'events', 'groups', 'sesiones', 'attendance', 'programas', 'documentos'].map((c) => store.subscribe(c, c === 'tasks' ? paintTasks : paintSchedule));
  const unsubTut = ['reuniones', 'medidas', 'students'].map((c) => store.subscribe(c, paintTutoria));
  const unsubPrint = ['impresiones', 'documentos'].map((c) => store.subscribe(c, paintPrint));
  const tick = setInterval(paintAll, 60_000); // sesión en curso y cambio de día
  return () => { alive = false; if (asistenteOff) asistenteOff(); unsubs.forEach((u) => u()); unsubTut.forEach((u) => u()); unsubPrint.forEach((u) => u()); clearInterval(tick); };
}
