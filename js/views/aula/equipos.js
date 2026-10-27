// Tabula · En clase · Grupos aleatorios
import { h } from '../../ui.js';
import { getStudents } from '../../school.js';
import { svg, shortName, shuffled, copyText, switchRow } from './common.js';

export function create(ctx) {
  const st = { modo: 'grupos', n: 4, sinAusentes: true, equipos: null };

  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Cómo repartir' });
  const stepVal = h('output', { class: 'au-step-val', 'aria-live': 'polite' });
  const stepLabel = h('span', { class: 'au-step-label' });
  const minus = h('button', { type: 'button', class: 'icon-btn au-step-btn', 'aria-label': 'Menos', onclick: () => bump(-1) }, '−');
  const plus = h('button', { type: 'button', class: 'icon-btn au-step-btn', 'aria-label': 'Más', onclick: () => bump(1) }, '+');
  const optHost = h('div');
  const makeBtn = h('button', { type: 'button', class: 'btn btn-primary au-big-btn', onclick: () => make() });
  const copyBtn = h('button', { type: 'button', class: 'btn au-big-btn', onclick: () => copyText(asText()) }, svg('copy', 20), 'Copiar texto');
  const out = h('div', { class: 'au-teams', 'aria-live': 'polite' });
  const info = h('div', { class: 'au-sub' });
  const el = h('div', { class: 'au-equipos' },
    h('div', { class: 'au-controls' }, seg,
      h('div', { class: 'au-stepper' }, minus, h('div', { class: 'au-step-box' }, stepVal, stepLabel), plus), optHost),
    h('div', { class: 'au-actions' }, makeBtn, copyBtn), info, out);

  const pupils = () => {
    const abs = st.sinAusentes ? ctx.absent() : new Set();
    return getStudents(ctx.groupId()).filter((s) => !abs.has(s.id));
  };
  const nTeams = (count) => (st.modo === 'grupos' ? Math.min(st.n, Math.max(1, count)) : Math.max(1, Math.ceil(count / st.n)));

  function bump(d) { st.n = Math.min(12, Math.max(2, st.n + d)); st.equipos = null; paint(); }

  function make() {
    const list = shuffled(pupils());
    if (!list.length) { st.equipos = []; return paint(); }
    const k = nTeams(list.length); const base = Math.floor(list.length / k); const extra = list.length % k;
    const teams = []; let i = 0;
    for (let t = 0; t < k; t++) { const size = base + (t < extra ? 1 : 0); teams.push(list.slice(i, i + size)); i += size; }
    st.equipos = teams; paint();
  }

  const asText = () => {
    const all = getStudents(ctx.groupId());
    return (st.equipos || []).map((t, i) => `Equipo ${i + 1}: ${t.map((s) => shortName(s, all)).join(', ')}`).join('\n');
  };

  function paint() {
    const all = getStudents(ctx.groupId()); const abs = ctx.absent(); const list = pupils();
    seg.replaceChildren(
      h('button', { type: 'button', 'aria-pressed': String(st.modo === 'grupos'), onclick: () => { st.modo = 'grupos'; st.equipos = null; paint(); } }, 'Nº de grupos'),
      h('button', { type: 'button', 'aria-pressed': String(st.modo === 'alumnos'), onclick: () => { st.modo = 'alumnos'; st.equipos = null; paint(); } }, 'Alumnos por grupo'));
    stepVal.textContent = String(st.n);
    stepLabel.textContent = st.modo === 'grupos' ? 'grupos' : 'por grupo';
    optHost.replaceChildren(switchRow('Sin quienes faltan hoy', st.sinAusentes, (v) => { st.sinAusentes = v; st.equipos = null; paint(); },
      { sub: abs.size ? `${abs.size} ${abs.size === 1 ? 'falta' : 'faltan'} hoy` : 'Hoy no hay faltas anotadas' }));
    const k = list.length ? nTeams(list.length) : 0;
    const sizes = list.length ? (list.length % k ? `${Math.floor(list.length / k)}–${Math.ceil(list.length / k)}` : String(list.length / k)) : '';
    info.textContent = list.length ? `${list.length} alumnos · ${k} grupos de ${sizes}` : 'No hay alumnado disponible';
    makeBtn.replaceChildren(svg('shuffle', 22), st.equipos ? 'Mezclar otra vez' : 'Formar grupos');
    makeBtn.disabled = !list.length; copyBtn.disabled = !(st.equipos && st.equipos.length);
    out.replaceChildren(...(st.equipos || []).map((t, i) => h('section', { class: `au-team t${(i % 6) + 1}`, 'aria-label': `Equipo ${i + 1}` },
      h('h3', { class: 'au-team-title' }, `Equipo ${i + 1}`, h('span', { class: 'au-team-n' }, String(t.length))),
      h('ul', { class: 'au-team-list' }, t.map((s) => h('li', {}, shortName(s, all)))))));
  }

  paint();
  return {
    el,
    setGroup() { st.equipos = null; paint(); },
    refresh() { paint(); },
    destroy() {},
  };
}
