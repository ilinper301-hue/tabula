// Tabula · En clase · Alumno al azar (sin repetir hasta que han salido todos)
import { store } from '../../store.js';
import { h, toast } from '../../ui.js';
import { getStudents, initials } from '../../school.js';
import { svg, shortName, reducedMotion, switchRow } from './common.js';

const key = (gid) => `aula:azar:${gid}`;
const load = (gid) => { const v = store.getSetting(key(gid), null) || {}; return { salidos: Array.isArray(v.salidos) ? v.salidos : [], sinAusentes: v.sinAusentes !== false }; };
const save = (gid, st) => store.setSetting(key(gid), st);

export function create(ctx) {
  let timers = []; let busy = false; let current = null; // current: id del último elegido
  const name = h('div', { class: 'au-azar-name', 'aria-hidden': 'true' });
  const hint = h('div', { class: 'au-azar-hint' });
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const stage = h('div', { class: 'au-azar-stage' }, name, hint);
  const drawBtn = h('button', { type: 'button', class: 'btn btn-primary au-big-btn', onclick: () => draw() });
  const resetBtn = h('button', { type: 'button', class: 'btn au-big-btn', onclick: () => reiniciar() }, svg('reset', 20), 'Reiniciar');
  const roster = h('ul', { class: 'au-roster', 'aria-label': 'Alumnado' });
  const count = h('div', { class: 'au-sub' });
  const optHost = h('div');
  const el = h('div', { class: 'au-azar' }, stage, h('div', { class: 'au-actions' }, drawBtn, resetBtn), optHost, count, roster, live);

  const students = () => getStudents(ctx.groupId());
  const absents = () => ctx.absent();

  function pool(st) {
    const abs = st.sinAusentes ? absents() : new Set();
    return students().filter((s) => !st.salidos.includes(s.id) && !abs.has(s.id));
  }

  function paint() {
    const gid = ctx.groupId(); const st = load(gid); const all = students(); const abs = absents();
    const eligible = all.filter((s) => !(st.sinAusentes && abs.has(s.id)));
    const out = eligible.filter((s) => st.salidos.includes(s.id)).length;
    optHost.replaceChildren(switchRow('No contar a quienes faltan hoy', st.sinAusentes, (v) => { save(gid, { ...load(gid), sinAusentes: v }); paint(); },
      { sub: abs.size ? `${abs.size} ${abs.size === 1 ? 'falta' : 'faltan'} hoy` : 'Hoy no hay faltas anotadas' }));
    if (!busy) {
      const s = current && all.find((x) => x.id === current);
      name.textContent = s ? s.nombre : '¿A quién le toca?';
      name.classList.toggle('is-idle', !s);
      hint.textContent = s ? [s.apellidos].filter(Boolean).join(' ') : all.length ? 'Pulsa el botón y sale un nombre' : 'Este grupo aún no tiene alumnado';
    }
    drawBtn.disabled = busy || !all.length;
    drawBtn.replaceChildren(svg('dice', 22), current ? 'Otra vez' : 'Elegir alumno/a');
    resetBtn.disabled = busy || !st.salidos.length;
    count.textContent = all.length ? `${out} de ${eligible.length} han salido` : '';
    roster.replaceChildren(...all.map((s) => {
      const isOut = st.salidos.includes(s.id); const isAbs = abs.has(s.id);
      return h('li', { class: `au-rost${isOut ? ' is-out' : ''}${isAbs ? ' is-abs' : ''}${s.id === current ? ' is-now' : ''}`, 'aria-label': `${s.nombre}${isOut ? ', ya ha salido' : ''}${isAbs ? ', falta hoy' : ''}` },
        h('span', { class: 'au-ini', 'aria-hidden': 'true' }, initials(s)), shortName(s, all));
    }));
  }

  function draw() {
    if (busy) return;
    const gid = ctx.groupId(); let st = load(gid); const all = students();
    let p = pool(st);
    let nueva = false;
    if (!p.length) {
      const abs = st.sinAusentes ? absents() : new Set();
      const base = all.filter((s) => !abs.has(s.id));
      if (!base.length) { toast('No hay alumnado disponible'); return; }
      st = { ...st, salidos: [] }; p = base; nueva = true;
    }
    if (p.length > 1 && current) p = p.filter((s) => s.id !== current);
    const pick = p[Math.floor(Math.random() * p.length)];
    busy = true; name.classList.remove('is-idle', 'is-final'); hint.textContent = '';
    paint();
    const finish = () => {
      busy = false; current = pick.id; name.classList.remove('is-shuffling');
      save(gid, { ...st, salidos: [...new Set([...st.salidos, pick.id])] });
      name.textContent = pick.nombre; hint.textContent = pick.apellidos || ''; name.classList.add('is-final');
      live.textContent = `Le toca a ${pick.nombre} ${pick.apellidos || ''}`.trim();
      if (nueva) toast('Han salido todos: empieza una ronda nueva');
      paint();
    };
    if (reducedMotion() || all.length < 2) return finish();
    // Barajado: los nombres pasan cada vez más despacio hasta parar en el elegido
    const names = all.map((s) => s.nombre); let i = 0; let delay = 55; let steps = 0; const maxSteps = 22;
    const step = () => {
      steps++;
      if (steps >= maxSteps) return finish();
      name.textContent = names[(i++) % names.length]; name.classList.add('is-shuffling');
      delay += 9;
      timers.push(setTimeout(step, delay));
    };
    step();
  }

  function reiniciar() {
    save(ctx.groupId(), { ...load(ctx.groupId()), salidos: [] });
    current = null; live.textContent = 'Lista reiniciada'; paint();
  }

  paint();
  return {
    el,
    setGroup() { timers.forEach(clearTimeout); timers = []; busy = false; current = null; paint(); },
    refresh() { if (!busy) paint(); },
    destroy() { timers.forEach(clearTimeout); },
  };
}
