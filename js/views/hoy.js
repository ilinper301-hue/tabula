// Tabula · pantalla "Hoy": el resumen del día

import { store } from '../store.js';
import { h, icon, longDate, greeting, todayISO, relativeDay, toast } from '../ui.js';
import { getSessionsForDate, getEventsForDate, getGroup, getAttendance, sessionLabel, areaShort, toMin, EVENT_TYPES } from '../school.js';
import { getPrograms } from '../programs.js';
import { matchProgramForSession, isCoordSession } from './programas/common.js';
import { dueNow, canPrint } from '../documents.js';
import { splitReuniones, reviewsDue, TIPOS_REUNION, MEDIDAS } from '../tutoria.js';
import { parseQuickInput, createTask, sortTasks, taskRow, isOverdue } from '../tasks-model.js';
import { quietStudents } from '../observations.js';

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
  const composer = h('div', { class: 'composer hy-composer' },
    h('label', { class: 'sr-only', for: 'hoy-captura' }, 'Añadir tarea'), input,
    h('button', { type: 'button', class: 'hy-mic', id: 'hoy-dictar', 'aria-label': 'Dictar a Tabula tareas, eventos, observaciones o tutorías', title: 'Dictar', onclick: () => import('./voz.js').then((m) => m.openVoz()) }, icon('mic', 18)),
    h('button', { class: 'send', 'aria-label': 'Añadir tarea', onclick: add }, icon('plus', 18)));

  // --- Tarjeta de tareas (se refresca sola) ---
  const tasksBody = h('div');
  const tasksCount = h('span', { class: 'eyebrow' });
  const tasksCard = h('section', { class: 'hy-sec', 'aria-labelledby': 'hoy-tareas-t' },
    h('div', { class: 'hy-sec-head' },
      h('h2', { class: 'hy-sec-title', id: 'hoy-tareas-t' }, 'Tareas'),
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
      tasksBody.replaceChildren(h('p', { class: 'hy-quiet' }, 'Nada pendiente hoy',
        upcoming ? h('span', {}, ` · ${upcoming} en los próximos días`) : ''));
      return;
    }
    const list = h('ul', { class: 'task-list' },
      ...pending.map((t) => taskRow(t, { compact: true, showDate: isOverdue(t) })),
      ...sortTasks(doneToday).map((t) => taskRow(t, { compact: true, showDate: false })));
    tasksBody.replaceChildren(list);
  }

  // --- Horario de hoy (sesión en curso destacada) ---
  const scheduleBody = h('div');
  const scheduleCard = h('section', { class: 'hy-sec', 'aria-labelledby': 'hoy-horario-t' },
    h('div', { class: 'hy-sec-head' },
      h('h2', { class: 'hy-sec-title', id: 'hoy-horario-t' }, 'Horario'),
      h('a', { class: 'link-btn', href: '#/calendario?vista=semana' }, 'Semana')),
    scheduleBody,
    h('div', { class: 'su-hoy-foot' },
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost su-hoy-btn', onclick: () => import('./sustituto.js').then((m) => m.openSustituto()) }, icon('note', 16), 'Plan para el sustituto')));
  // Lo que toca ahora (o lo siguiente): lo primero que se ve, con sus acciones
  const nowSlot = h('div', { class: 'hy-now-slot' });

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
      nowSlot.replaceChildren();
      const anySchedule = store.list('schedule').length > 0;
      const wd = now.getDay();
      items.push(anySchedule
        ? h('p', { class: 'hy-quiet' }, wd === 0 || wd === 6 ? 'Fin de semana: hoy no hay clase' : 'Hoy no tienes sesiones')
        : h('p', { class: 'hy-quiet' }, 'Aún no has creado tu horario · ', h('a', { href: '#/calendario?vista=horario' }, 'Crear horario')));
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
    const clases = blocks.filter((b) => b.tipo === 'clase' || b.tipo === 'otro');
    const hero = clases.find((b) => toMin(b.inicio) <= nowMin && nowMin < toMin(b.fin))
      || clases.find((b) => toMin(b.inicio) > nowMin) || null;
    paintNow(hero, planned, nowMin, today);
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
      const sub = [group && group.nombre, plan ? plan.titulo : null, s.aula].filter(Boolean).join(' · ');
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
        // Evaluación rápida (niveles por criterio) después de la clase
        s.tipo === 'clase' && group && s.area && past ? evalButton(s, group, plan, false) : null,
        // Documentos adjuntos a la sesión planificada
        plan && (plan.documentoIds || []).filter((id) => store.get('documentos', id)).length ? docClip(plan) : null,
        // Programas: anotar en el diario desde una sesión de coordinación u otra actividad de un programa
        programButton(s),
        null));
    });
    items.push(list);
    scheduleBody.replaceChildren(...items);
  }

  function paintNow(s, planned, nowMin, today) {
    if (!s) { nowSlot.replaceChildren(); return; }
    const current = toMin(s.inicio) <= nowMin;
    const group = getGroup(s.groupId);
    const plan = s.tipo === 'clase' ? planned.find((x) => s.parts.some((p) => p.id === x.scheduleId)) : null;
    const falta = toMin(s.inicio) - nowMin;
    const cuando = current ? `Ahora · hasta las ${s.fin}`
      : falta <= 60 ? `Siguiente · en ${falta} min` : `Siguiente · a las ${s.inicio}`;
    const isClass = s.tipo === 'clase' && group;
    const lista = isClass ? getAttendance(group.id, today) : null;
    const actions = [
      isClass ? (lista
        ? h('a', { class: 'btn btn-sm hy-now-done', href: `#/grupos?id=${group.id}&tab=asistencia&fecha=${today}`, 'aria-label': `Lista de ${group.nombre} pasada; ver asistencia` }, icon('check', 15), 'Lista pasada')
        : h('a', { class: `btn btn-sm${current ? ' btn-primary' : ''}`, href: `#/grupos?id=${group.id}&tab=asistencia&fecha=${today}` }, icon('grupos', 15), 'Pasar lista')) : '',
      isClass && current ? h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Registrar observación en ${group.nombre}`,
        onclick: () => import('./anecdotario.js').then((m) => m.openQuickObservation({ groupId: group.id, area: s.area, sesionId: plan ? plan.id : null })) }, icon('note', 15), 'Observar') : '',
      isClass && s.area ? h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Evaluar ${areaShort(s.area)} con ${group.nombre}`,
        onclick: () => import('./aula/evaluar.js').then((m) => m.openQuickEval({ groupId: group.id, area: s.area, sesionId: plan ? plan.id : null })) }, icon('check', 15), 'Evaluar') : '',
      plan ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => import('./planificacion/session-sheet.js').then((m) => m.openSessionSheet(plan.id)) }, 'Ver sesión') : '',
      programButton(s) || '',
    ];
    nowSlot.replaceChildren(h('section', { class: `hy-now${current ? ' is-live' : ''}`, 'aria-label': current ? 'Clase en curso' : 'Próxima clase' },
      h('div', { class: 'hy-now-when' }, current ? h('span', { class: 'hy-dot', 'aria-hidden': 'true' }) : '', cuando),
      h('div', { class: 'hy-now-title' }, s.tipo === 'clase' ? areaShort(s.area) || 'Clase' : sessionLabel(s)),
      h('div', { class: 'hy-now-sub' }, [group && group.nombre, plan && plan.titulo, s.aula, `${s.inicio}–${s.fin}`].filter(Boolean).join(' · ')),
      h('div', { class: 'hy-now-actions' }, ...actions)));
  }

  // --- Para imprimir hoy (Documentos): solo aparece si hay algo pendiente ---
  const printBody = h('ul', { class: 'dc-mini-list' });
  const printCard = h('section', { class: 'hy-sec', 'aria-labelledby': 'hoy-imprimir-t', hidden: true },
    h('div', { class: 'hy-sec-head' },
      h('h2', { class: 'hy-sec-title', id: 'hoy-imprimir-t' }, 'Para imprimir'),
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
  const tutCard = h('section', { class: 'hy-sec', 'aria-labelledby': 'hoy-tutoria-t', hidden: true },
    h('div', { class: 'hy-sec-head' },
      h('h2', { class: 'hy-sec-title', id: 'hoy-tutoria-t' }, 'Tutoría'),
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

  // --- Sin observar: alumnado sin anotaciones en 3 semanas (solo si se usa el anecdotario) ---
  const quietBody = h('div');
  const quietCard = h('section', { class: 'hy-sec', 'aria-labelledby': 'hoy-quiet-t', hidden: true },
    h('div', { class: 'hy-sec-head' }, h('h2', { class: 'hy-sec-title', id: 'hoy-quiet-t' }, 'Sin observar')), quietBody);
  function paintQuiet() {
    const groups = store.list('groups').filter((g) => !g.archivado);
    const active = new Set(groups.map((g) => g.id));
    const quiet = quietStudents(store.list('students').filter((x) => active.has(x.groupId)), store.list('observaciones'), todayISO());
    quietCard.hidden = !quiet.length;
    if (!quiet.length) { quietBody.replaceChildren(); return; }
    const byGroup = groups.map((g) => ({ g, list: quiet.filter((q) => q.student.groupId === g.id) })).filter((x) => x.list.length);
    quietBody.replaceChildren(
      h('p', { class: 'hy-quiet' }, quiet.length === 1 ? 'Lleva más de 3 semanas sin ninguna observación:' : `${quiet.length} llevan más de 3 semanas sin ninguna observación:`),
      ...byGroup.map(({ g, list }) => h('a', { class: 'hy-quiet-row', href: `#/grupos?id=${g.id}&tab=observaciones` },
        h('span', { class: 'hy-quiet-names' }, list.slice(0, 6).map((q) => q.student.nombre).join(', ') + (list.length > 6 ? ` y ${list.length - 6} más` : '')),
        byGroup.length > 1 ? h('span', { class: 'hy-quiet-group' }, g.nombre) : '')));
  }

  // --- Bandeja del asistente: solo aparece si hay apuntes por revisar o un dispositivo pendiente ---
  const asistenteSlot = h('div', { class: 'hy-as-slot' });
  let alive = true, asistenteOff = null;
  import('./bandeja.js').then((m) => { if (alive) asistenteOff = m.mountHoyCard(asistenteSlot); }).catch(() => {});

  container.replaceChildren(h('div', { class: 'hy' },
    h('header', { class: 'page-head hy-head' },
      h('div', { class: 'hy-head-text' },
        h('div', { class: 'eyebrow' }, longDate(), ' · ', tasksCount),
        h('h1', { class: 'page-title' }, firstName ? `${greeting()}, ${firstName}` : greeting())),
      h('a', { class: 'icon-btn hy-aula', href: '#/aula', 'aria-label': 'En clase: herramientas del aula', title: 'En clase' }, icon('aula', 20))),
    composer,
    asistenteSlot,
    nowSlot,
    h('div', { class: 'today-grid hy-grid' },
      h('div', { class: 'today-col' }, scheduleCard, tutCard),
      h('div', { class: 'today-col' }, tasksCard, printCard, quietCard))));

  const paintAll = () => { paintTasks(); paintSchedule(); paintPrint(); paintTutoria(); paintQuiet(); };
  paintAll();
  const unsubs = ['tasks', 'schedule', 'events', 'groups', 'sesiones', 'attendance', 'programas', 'documentos'].map((c) => store.subscribe(c, c === 'tasks' ? paintTasks : paintSchedule));
  const unsubTut = ['reuniones', 'medidas', 'students'].map((c) => store.subscribe(c, paintTutoria));
  unsubTut.push(store.subscribe('observaciones', paintQuiet));
  const unsubPrint = ['impresiones', 'documentos'].map((c) => store.subscribe(c, paintPrint));
  const tick = setInterval(paintAll, 60_000); // sesión en curso y cambio de día
  return () => { alive = false; if (asistenteOff) asistenteOff(); unsubs.forEach((u) => u()); unsubTut.forEach((u) => u()); unsubPrint.forEach((u) => u()); clearInterval(tick); };
}
