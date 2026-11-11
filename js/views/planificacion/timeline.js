// Tabula · Planificación · franja temporal: qué situación ocupa cada semana de la evaluación
import { h, fromISO, toISO, addDaysISO, diffDays, todayISO } from '../../ui.js';
import { currentSchoolYear } from '../../school.js';
import { shortDate, href, currentEvaluacion } from './model.js';

/** Rango aproximado de cada evaluación dentro del curso escolar. */
function evalRange(ev) {
  const y = Number(currentSchoolYear().slice(0, 4));
  return { 1: [`${y}-09-01`, `${y}-12-23`], 2: [`${y + 1}-01-01`, `${y + 1}-03-31`], 3: [`${y + 1}-04-01`, `${y + 1}-06-30`] }[ev];
}
const mondayOf = (iso) => { const d = fromISO(iso); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return toISO(d); };

/**
 * @param sits situaciones del grupo y área
 * @param sesiones sesiones del grupo y área
 * @param opts { groupId, area, ev, prevScroll } — ev: la evaluación de la barra de contexto
 */
export function renderTimeline(sits, sesiones, { groupId, area, ev: evIn, prevScroll }) {
  const ev = [1, 2, 3].includes(evIn) ? evIn : currentEvaluacion();
  const [from, to] = evalRange(ev);
  const start = mondayOf(from);
  const weeks = [];
  for (let d = start; d <= to; d = addDaysISO(d, 7)) weeks.push(d);
  const today = todayISO();
  const curWeek = weeks.findIndex((w) => today >= w && today < addDaysISO(w, 7));

  // Sesiones por situación y semana
  const rows = sits.map((s, i) => {
    const counts = new Array(weeks.length).fill(0);
    sesiones.filter((x) => x.situacionId === s.id && x.fecha).forEach((x) => {
      const k = Math.floor(diffDays(x.fecha, start) / 7);
      if (k >= 0 && k < weeks.length) counts[k]++;
    });
    return { s, counts, color: `t${(i % 6) + 1}` };
  }).filter((r) => r.counts.some(Boolean));


  const cols = `minmax(130px, 170px) repeat(${weeks.length}, 46px)`;
  const grid = h('div', { class: 'pl-tl-grid', style: { gridTemplateColumns: cols } },
    h('div', { class: 'pl-tl-corner' }),
    weeks.map((w, i) => h('div', { class: `pl-tl-week${i === curWeek ? ' is-now' : ''}`, title: `Semana del ${shortDate(w)}` }, shortDate(w))),
    rows.map((r) => [
      h('a', { class: 'pl-tl-label', href: href({ grupo: groupId, area, ev, sit: r.s.id }), title: r.s.titulo }, r.s.titulo),
      ...r.counts.map((n, i) => h('div', { class: `pl-tl-cell${i === curWeek ? ' is-now' : ''}` },
        n ? h('span', { class: `pl-tl-bar ${r.color}`, title: `${r.s.titulo}: ${n} ${n === 1 ? 'sesión' : 'sesiones'}` }, String(n)) : null)),
    ]));

  const scroll = h('div', { class: 'pl-tl-scroll', tabindex: '0', role: 'region', 'aria-label': 'Semanas de la evaluación' },
    rows.length ? grid : h('div', { class: 'pl-tl-empty' }, `Cuando programes sesiones de la ${ev}.ª evaluación, verás aquí qué semanas ocupa cada situación.`));
  // Posición inicial: la semana actual si está en la evaluación; si no, la que había
  requestAnimationFrame(() => {
    if (prevScroll != null) scroll.scrollLeft = prevScroll;
    else if (curWeek > 1) scroll.scrollLeft = Math.max(0, (curWeek - 2) * 46);
  });

  return h('section', { class: 'card pl-tl' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Línea de tiempo'), h('span', { class: 'pl-tl-ev' }, `${ev}.ª evaluación`)),
    scroll);
}
