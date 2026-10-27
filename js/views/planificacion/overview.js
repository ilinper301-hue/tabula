// Tabula · Planificación · vista general (sin situación seleccionada)
import { store } from '../../store.js';
import { h, icon, toast, todayISO } from '../../ui.js';
import { sortSessions, situacionProgress, overdueSessions } from '../../planning.js';
import {
  ESTADOS_SIT, ESTADO_SIT_CLASS, plural, shortDate, whenText, href, ico, swapOrden, normalizeOrden,
  postponeSession, situacionesOf,
} from './model.js';
import { renderTimeline } from './timeline.js';
import { openSessionSheet } from './session-sheet.js';

/**
 * @param env { groupId, area, sits, sesiones, schedule, go, newSituacion, repaint, prevTlScroll }
 */
export function renderOverview(env) {
  const { groupId, area, sits, sesiones, schedule } = env;
  const today = todayISO();
  const titleOf = new Map(sits.map((s) => [s.id, s.titulo]));
  const parts = [];

  if (!sits.length) {
    parts.push(h('section', { class: 'card' }, h('div', { class: 'empty pl-empty' }, icon('planificacion', 44),
      h('strong', {}, 'Aún no hay situaciones de aprendizaje'),
      'Crea la primera y reparte sus sesiones en el horario.',
      h('div', { class: 'pl-empty-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: env.newSituacion }, icon('plus', 16), 'Nueva situación de aprendizaje')))));
    return parts;
  }

  // ---------- Sesiones vencidas ----------
  const late = sortSessions(overdueSessions(sesiones, today), sits);
  if (late.length) {
    parts.push(h('section', { class: 'card pl-late', 'aria-label': 'Sesiones pendientes de fechas pasadas' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title pl-late-title' }, ico('warn', 20),
        plural(late.length, 'sesión sin cerrar', 'sesiones sin cerrar'))),
      h('p', { class: 'pl-hint' }, 'Tenían fecha pasada y siguen pendientes. Márcalas como hechas o aplázalas.'),
      h('ul', { class: 'pl-list' }, late.slice(0, 8).map((s) => h('li', { class: 'pl-row' },
        h('button', { type: 'button', class: 'pl-row-main', onclick: () => openSessionSheet(s.id) },
          h('strong', {}, s.titulo || 'Sesión'),
          h('span', { class: 'pl-sub' }, `${whenText(s, schedule)} · ${titleOf.get(s.situacionId) || ''}`)),
        h('div', { class: 'pl-row-actions' },
          h('button', {
            type: 'button', class: 'btn btn-sm', onclick: () => {
              store.update('sesiones', s.id, { estado: 'hecha' });
              toast('Sesión marcada como hecha', { label: 'Deshacer', run: () => store.update('sesiones', s.id, { estado: 'pendiente' }) });
            },
          }, icon('check', 14), 'Marcar hecha'),
          h('button', {
            type: 'button', class: 'btn btn-sm', onclick: () => {
              const { changes, undo } = postponeSession(s.id);
              toast(`Sesión aplazada; ${plural(changes.length, 'sesión reajustada', 'sesiones reajustadas')}`, { label: 'Deshacer', run: undo });
            },
          }, 'Aplazar'))))),
      late.length > 8 ? h('p', { class: 'pl-hint' }, `y ${late.length - 8} más`) : null));
  }

  // ---------- Próximas sesiones ----------
  const next = sortSessions(sesiones.filter((s) => s.estado === 'pendiente' && s.fecha && s.fecha >= today), sits).slice(0, 10);
  parts.push(h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Próximas sesiones')),
    next.length
      ? h('ul', { class: 'pl-list' }, next.map((s) => h('li', { class: 'pl-row' },
        h('button', { type: 'button', class: 'pl-row-main', onclick: () => openSessionSheet(s.id) },
          h('strong', {}, s.titulo || 'Sesión'),
          h('span', { class: 'pl-sub' }, titleOf.get(s.situacionId) || '')),
        h('span', { class: 'pl-when' }, whenText(s, schedule), s.fija ? ico('pin', 14) : null))))
      : h('p', { class: 'pl-hint' }, 'No hay sesiones programadas a partir de hoy. Abre una situación y pulsa «Programar en el horario».')));

  // ---------- Línea de tiempo ----------
  parts.push(renderTimeline(sits, sesiones, { groupId, area, onEvChange: env.repaint, prevScroll: env.prevTlScroll }));

  // ---------- Situaciones por evaluación ----------
  for (const ev of [1, 2, 3]) {
    const list = sits.filter((s) => (s.evaluacion || 1) === ev);
    if (!list.length) continue;
    parts.push(h('section', { class: 'pl-ev', 'aria-label': `${ev}.ª evaluación` },
      h('h2', { class: 'section-label' }, `${ev}.ª evaluación`),
      h('div', { class: 'pl-cards' }, list.map((s, i) => sitCard(env, s, i, list)))));
  }
  return parts;
}

function sitCard(env, s, i, list) {
  const p = situacionProgress(s.id, env.sesiones);
  const pct = p.total ? Math.round((p.hechas / p.total) * 100) : 0;
  const nCrit = (s.criterioIds || []).length;
  const dates = p.inicio ? (p.inicio === p.fin ? shortDate(p.inicio) : `${shortDate(p.inicio)} – ${shortDate(p.fin)}`) : 'Sin programar';
  const move = (dir) => {
    // Reordena dentro de la evaluación; antes normaliza por si había valores repetidos
    const all = situacionesOf(env.groupId, env.area);
    normalizeOrden('situaciones', all);
    const fresh = situacionesOf(env.groupId, env.area);
    const a = fresh.find((x) => x.id === s.id);
    const sib = fresh.filter((x) => (x.evaluacion || 1) === (s.evaluacion || 1));
    const j = sib.findIndex((x) => x.id === s.id) + dir;
    if (j >= 0 && j < sib.length) swapOrden('situaciones', a, sib[j]);
  };
  return h('article', { class: 'card pl-sit' },
    h('div', { class: 'pl-sit-head' },
      h('a', { class: 'pl-sit-title', href: href({ grupo: env.groupId, area: env.area, sit: s.id }) }, s.titulo || 'Sin título'),
      h('span', { class: `chip ${ESTADO_SIT_CLASS[s.estado] || 't5'}` }, ESTADOS_SIT[s.estado] || s.estado)),
    h('p', { class: 'pl-sit-dates' }, icon('calendario', 15), dates),
    h('div', { class: 'pl-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': p.total, 'aria-valuenow': p.hechas,
      'aria-label': `${p.hechas} de ${p.total} sesiones hechas` }, h('span', { style: { width: `${pct}%` } })),
    h('div', { class: 'pl-sit-meta' },
      h('span', {}, p.total ? `${p.hechas}/${p.total} hechas` : 'Sin sesiones'),
      p.sinFecha && p.total ? h('span', { class: 'pl-warn' }, `${p.sinFecha} sin fecha`) : null,
      h('span', {}, plural(nCrit, 'criterio', 'criterios'))),
    h('div', { class: 'pl-sit-foot' },
      h('a', { class: 'btn btn-sm', href: href({ grupo: env.groupId, area: env.area, sit: s.id }) }, 'Abrir'),
      h('div', { class: 'pl-move' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Subir «${s.titulo}»`, disabled: i === 0, onclick: () => move(-1) }, ico('up')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Bajar «${s.titulo}»`, disabled: i === list.length - 1, onclick: () => move(1) }, ico('down')))));
}
