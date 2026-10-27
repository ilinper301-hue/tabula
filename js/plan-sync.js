// Tabula · mantiene la planificación al día cuando cambian los días no lectivos.
// Si se añade, mueve o borra un evento "no lectivo", las sesiones pendientes afectadas
// se recolocan en el horario a partir de la primera fecha que ha cambiado.

import { store } from './store.js';
import { reflowFrom } from './planning.js';
import { todayISO } from './ui.js';

const signature = () => store.list('events')
  .filter((e) => e.tipo === 'nolectivo')
  .map((e) => `${e.id}:${e.fecha}:${e.fechaFin || ''}`).sort();

let prev = new Set(signature());

function onEventsChange() {
  const now = new Set(signature());
  const changed = [...now].filter((x) => !prev.has(x)).concat([...prev].filter((x) => !now.has(x)));
  prev = now;
  if (!changed.length || store._fromRemote) return;

  // Primera fecha afectada (nunca antes de hoy: el pasado no se reprograma)
  const dates = changed.map((x) => x.split(':')[1]).filter(Boolean).sort();
  const from = [dates[0], todayISO()].sort()[1];

  const schedule = store.list('schedule');
  const events = store.list('events');
  const situaciones = store.list('situaciones');
  const all = store.list('sesiones');
  const pairs = new Set(all.map((s) => `${s.groupId}|${s.area}`));
  let moved = 0;
  for (const key of pairs) {
    const [groupId, area] = key.split('|');
    const own = all.filter((s) => s.groupId === groupId && s.area === area);
    const changes = reflowFrom(from, own, { schedule, events, groupId, area }, situaciones);
    changes.forEach((c) => store.update('sesiones', c.id, { fecha: c.fecha, scheduleId: c.scheduleId }));
    moved += changes.length;
  }
  if (moved) import('./ui.js').then(({ toast }) => toast(`Planificación reajustada: ${moved} sesion${moved > 1 ? 'es movidas' : ' movida'}`));
}

store.subscribe('events', onEventsChange);
