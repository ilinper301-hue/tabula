// Tabula · Evaluación rápida en clase: elige un criterio, toca a cada alumno y pon su nivel.
// Cada nivel queda en el Cuaderno como actividad de observación (ver js/quick-eval.js).
import { store } from '../../store.js';
import { h, icon, openSheet, toast, todayISO } from '../../ui.js';
import { getGroup, getStudents, initials, fullName, areaShort, areaColor } from '../../school.js';
import { LEVELS, LEVEL_LABELS, competenciaOf } from '../../grading.js';
import { critRubric } from '../../informes.js';
import { hasOfficial } from '../../curriculo.js';
import { gradebookFor, quickLevels, lastLevels, setQuickLevel } from '../../quick-eval.js';
import { createGradebook, evaluacionDefaults, addOfficialCriteria, cursoOf } from '../cuaderno/model.js';
import { absentIds, shortDate, svg } from './common.js';

const remembered = new Map();   // «grupo|área» → último criterio usado (mientras la app está abierta)
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function openQuickEval({ groupId, area, sesionId = null, criterioId = null } = {}) {
  const group = getGroup(groupId);
  if (!group || !area) { toast('Elige un grupo y un área'); return () => {}; }
  const fecha = todayISO();
  const rkey = `${groupId}|${area}`;
  const st = { crit: criterioId || remembered.get(rkey) || null, q: '', brush: null, chooser: null, bulk: null, loading: false };
  let painting = false; let closed = false;

  const root = h('div', { class: 'au-ev' });
  const close = openSheet('Evaluación rápida', root, { className: 'au-eval-sheet', onClose: () => { closed = true; unsubs.forEach((u) => u()); } });
  const unsubs = ['gradebooks', 'grades', 'activities', 'attendance', 'students'].map((c) => store.subscribe(c, schedule));
  function schedule() { if (painting || closed) return; painting = true; queueMicrotask(() => { painting = false; if (!closed) paint(); }); }

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Buscar criterio (código o texto)', 'aria-label': 'Buscar criterio', oninput: (e) => { st.q = e.target.value; paintList(); } });
  const listHost = h('div', { class: 'au-crit-list' });

  // ---------- Criterios de la situación vinculada ----------
  function linked() {
    let ids = []; let title = '';
    const se = sesionId && store.get('sesiones', sesionId);
    const sit = se && store.get('situaciones', se.situacionId);
    if (sit && (sit.criterioIds || []).length) { ids = sit.criterioIds; title = sit.titulo; }
    if (!ids.length) {
      const sits = store.list('situaciones').filter((s) => s.groupId === groupId && s.area === area && s.estado === 'en_curso' && (s.criterioIds || []).length);
      ids = [...new Set(sits.flatMap((s) => s.criterioIds))];
      title = sits.length === 1 ? sits[0].titulo : sits.length ? 'situaciones en curso' : '';
    }
    return { ids, title };
  }

  const ceChip = (c) => { const n = competenciaOf(c.codigo); return n ? h('span', { class: `chip t${(Number(n) - 1) % 6 + 1}`, title: `Competencia específica ${n}` }, `CE${n}`) : null; };

  function ctxLine() {
    return h('div', { class: 'au-ev-ctx' },
      h('span', { class: `chip ${group.color || 't2'}` }, group.nombre),
      h('span', { class: `chip ${areaColor(area)}` }, areaShort(area)),
      h('span', { class: 'au-sub' }, `Hoy, ${shortDate(fecha)}`));
  }

  // ---------- Sin cuaderno o sin criterios ----------
  function emptyView(gb) {
    const curso = cursoOf(groupId);
    const link = h('a', { href: `#/cuaderno?${new URLSearchParams({ grupo: groupId, area })}`, onclick: () => close() }, 'el Cuaderno');
    if (!curso || !hasOfficial(area, curso)) {
      return h('div', { class: 'empty' }, icon('cuaderno', 36), h('strong', {}, 'Este cuaderno aún no tiene criterios'),
        h('span', {}, 'Añádelos en ', link, ' para poder evaluar desde aquí.'));
    }
    const btn = h('button', { type: 'button', class: 'btn btn-primary au-big-btn', disabled: st.loading, onclick: async () => {
      st.loading = true; btn.disabled = true;
      const done = (r) => { st.loading = false; toast(r && r.added ? `${r.added} criterios oficiales de ${curso}º cargados` : 'No se pudieron cargar los criterios'); schedule(); };
      try { if (gb) done(await addOfficialCriteria(gb.id)); else createGradebook(groupId, area, evaluacionDefaults(), { onOfficial: done }); }
      catch { done(null); }
    } }, icon('download', 18), `Cargar criterios oficiales de ${curso}º`);
    return h('div', { class: 'empty au-ev-empty' }, icon('cuaderno', 36), h('strong', {}, 'Todavía no hay criterios de evaluación'),
      h('span', {}, `Carga los del BOJA para ${areaShort(area)} de ${curso}º y evalúa en un toque. Quedarán en `, link, '.'), btn);
  }

  // ---------- Selector de criterio ----------
  function critRow(c, today) {
    const n = Object.keys(quickLevels(gradebookFor(groupId, area).id, c.id, fecha)).length;
    return h('button', { type: 'button', class: 'au-crit', 'data-crit': c.id, onclick: () => choose(c.id) },
      h('span', { class: 'au-crit-code' }, c.codigo || '—'),
      h('span', { class: 'au-crit-desc' }, c.descripcion || ''),
      h('span', { class: 'au-crit-tags' }, ceChip(c), n ? h('span', { class: 'chip t3', title: 'Evaluados hoy' }, `Hoy ${n}`) : null));
  }
  function paintList() {
    const gb = gradebookFor(groupId, area); if (!gb) return;
    const crit = gb.criterios || []; const q = norm(st.q).trim();
    const match = (c) => !q || norm(`${c.codigo} ${c.descripcion}`).includes(q);
    const { ids, title } = linked();
    const lk = crit.filter((c) => ids.includes(c.id) && match(c));
    const rest = crit.filter((c) => !ids.includes(c.id) && match(c));
    const parts = [];
    if (lk.length) parts.push(h('div', { class: 'section-label' }, title ? `De «${title}»` : 'De la situación de aprendizaje'), ...lk.map((c) => critRow(c)));
    if (rest.length) parts.push(h('div', { class: 'section-label' }, lk.length ? 'Todos los criterios' : 'Criterios'), ...rest.map((c) => critRow(c)));
    if (!parts.length) parts.push(h('div', { class: 'empty' }, h('strong', {}, 'Ningún criterio coincide')));
    listHost.replaceChildren(...parts);
  }
  function pickerView() {
    queueMicrotask(paintList);
    return h('div', { class: 'au-picker' }, h('p', { class: 'au-ev-lead' }, '¿Qué criterio quieres evaluar ahora?'), search, listHost);
  }
  function choose(id) { st.crit = id; remembered.set(rkey, id); st.brush = null; st.bulk = null; paint(); }

  // ---------- Cuadrícula de alumnos ----------
  const initialsOf = initials;
  function gridView(gb, cr) {
    const students = getStudents(groupId); const abs = absentIds(groupId, fecha);
    const levels = quickLevels(gb.id, cr.id, fecha); const prevL = lastLevels(gb.id, cr.id, fecha);
    const rub = critRubric(cr);
    const done = students.filter((s) => levels[s.id]).length;
    const pending = students.filter((s) => !levels[s.id] && !abs.has(s.id));

    const brush = h('div', { class: 'au-brush', role: 'group', 'aria-label': 'Nivel que se aplica al tocar un alumno' },
      LEVELS.map((lv) => h('button', { type: 'button', class: 'au-lv', 'data-lv': lv, 'aria-pressed': String(st.brush === lv), title: `${LEVEL_LABELS[lv]}: ${rub[lv]}`,
        onclick: () => { st.brush = st.brush === lv ? null : lv; paint(); } }, h('strong', {}, lv), h('small', {}, LEVEL_LABELS[lv]))));

    const bulkBtn = h('button', { type: 'button', class: 'btn', disabled: !pending.length, 'aria-expanded': String(st.bulk !== null),
      onclick: () => { st.bulk = st.bulk === null ? { level: null } : null; paint(); } }, `Poner nivel al resto${pending.length ? ` (${pending.length})` : ''}`);

    const bulkBox = st.bulk ? h('div', { class: 'confirm-box au-bulk', role: 'group', 'aria-label': 'Poner el mismo nivel al resto' },
      h('p', {}, `Elige el nivel para los ${pending.length} que faltan por evaluar${abs.size && students.some((s) => abs.has(s.id) && !levels[s.id]) ? ' (sin quienes faltan hoy)' : ''}.`),
      h('div', { class: 'au-bulk-lv' }, LEVELS.map((lv) => h('button', { type: 'button', class: 'au-lv', 'data-lv': lv, 'aria-pressed': String(st.bulk.level === lv), title: `${LEVEL_LABELS[lv]}: ${rub[lv]}`,
        onclick: () => { st.bulk.level = lv; paint(); } }, h('strong', {}, lv)))),
      st.bulk.level ? h('p', { class: 'au-bulk-q' }, `¿Poner ${st.bulk.level} (${LEVEL_LABELS[st.bulk.level].toLowerCase()}) a ${pending.length} alumnos?`) : null,
      h('div', { class: 'au-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', disabled: !st.bulk.level, onclick: () => bulkApply(gb, cr, pending, st.bulk.level) }, 'Confirmar'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { st.bulk = null; paint(); } }, 'Cancelar'))) : null;

    const tiles = students.map((s) => tile(s, levels[s.id], prevL[s.id], abs.has(s.id), gb, cr));

    return h('div', { class: 'au-grid-view' },
      h('div', { class: 'au-ev-crit' },
        h('div', { class: 'au-ev-crit-top' }, h('span', { class: 'au-crit-code' }, cr.codigo || '—'), ceChip(cr),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost au-change', onclick: () => { st.crit = null; st.brush = null; st.bulk = null; paint(); } }, 'Cambiar criterio')),
        h('p', { class: 'au-ev-crit-text' }, cr.descripcion || '')),
      h('div', { class: 'au-ev-bar' },
        h('div', { class: 'au-count', role: 'status', 'aria-live': 'polite' }, h('strong', {}, `${done}/${students.length}`), ' evaluados'),
        bulkBtn),
      bulkBox,
      h('div', { class: 'au-brush-wrap' }, h('span', { class: 'au-sub' }, st.brush ? `Toca a un alumno para ponerle ${st.brush}. Vuelve a tocar el nivel para soltarlo.` : 'Pulsa un nivel para aplicarlo a varios seguidos, o toca un alumno para elegir.'), brush),
      h('div', { class: 'au-tiles' }, tiles),
      h('p', { class: 'au-sub au-tip' }, 'Mantén pulsado un alumno para quitarle el nivel.'));
  }

  function tile(s, lv, prev, absent, gb, cr) {
    let timer = null; let long = false;
    const label = `${fullName(s)}${lv ? `, ${LEVEL_LABELS[lv]}` : ', sin evaluar'}${absent ? ', falta hoy' : ''}`;
    const b = h('button', { type: 'button', class: `au-tile${lv ? ' has-lv' : ''}${absent ? ' is-abs' : ''}`, 'data-sid': s.id, 'data-lv': lv || null, 'aria-label': label,
      title: prev ? `Antes: ${LEVEL_LABELS[prev.nivel]} (${shortDate(prev.fecha)})` : null,
      onpointerdown: () => { long = false; clearTimeout(timer); timer = setTimeout(() => { long = true; if (lv) { setQuickLevel(gb.id, cr.id, s.id, null, fecha); try { navigator.vibrate && navigator.vibrate(30); } catch {} } }, 600); },
      onpointerup: () => clearTimeout(timer), onpointerleave: () => clearTimeout(timer), onpointercancel: () => clearTimeout(timer),
      oncontextmenu: (e) => e.preventDefault(),
      onclick: () => {
        if (long) { long = false; return; }
        if (st.brush) { setQuickLevel(gb.id, cr.id, s.id, lv === st.brush ? null : st.brush, fecha); return; }
        openChooser(s, lv, gb, cr);
      } },
      h('span', { class: 'au-tile-top' }, h('span', { class: 'au-ini', 'aria-hidden': 'true' }, initialsOf(s)),
        lv ? h('span', { class: 'au-badge' }, lv) : prev ? h('span', { class: 'au-badge au-badge-prev', 'data-lv': prev.nivel, 'aria-hidden': 'true' }, prev.nivel) : null),
      h('span', { class: 'au-tile-name' }, s.nombre), h('span', { class: 'au-tile-sub' }, absent ? 'Falta hoy' : (s.apellidos || '')));
    return b;
  }

  function bulkApply(gb, cr, pending, level) {
    painting = true;                                   // un solo repintado al final
    pending.forEach((s) => setQuickLevel(gb.id, cr.id, s.id, level, fecha));
    painting = false; st.bulk = null; paint();
    toast(`${level} puesto a ${pending.length} alumnos`);
  }

  // ---------- Selector de nivel para un alumno ----------
  function openChooser(s, current, gb, cr) {
    const rub = critRubric(cr);
    const back = document.activeElement;
    const finish = (lv) => {
      pop.remove(); document.removeEventListener('keydown', onKey, true);
      if (lv !== undefined) setQuickLevel(gb.id, cr.id, s.id, lv, fecha);
      paint(); const t = root.querySelector(`.au-tile[data-sid="${s.id}"]`); (t || back)?.focus?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(undefined); }
      else if (/^[1-5]$/.test(e.key)) { e.preventDefault(); finish(LEVELS[Number(e.key) - 1]); }
    };
    document.addEventListener('keydown', onKey, true);
    const pop = h('div', { class: 'au-pop-back', onclick: (e) => { if (e.target === pop) finish(undefined); } },
      h('div', { class: 'au-pop', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Nivel de ${fullName(s)}` },
        h('div', { class: 'au-pop-head' }, h('span', { class: 'au-ini au-ini-lg', 'aria-hidden': 'true' }, initialsOf(s)),
          h('div', {}, h('strong', {}, fullName(s)), h('div', { class: 'au-sub' }, `${cr.codigo || ''} · pulsa 1-5 o toca un nivel`))),
        h('div', { class: 'au-pop-levels' }, LEVELS.map((lv, i) => h('button', { type: 'button', class: 'au-pop-lv', 'data-lv': lv, 'aria-pressed': String(current === lv), onclick: () => finish(lv) },
          h('strong', {}, lv), h('span', { class: 'au-pop-txt' }, h('b', {}, LEVEL_LABELS[lv]), h('small', {}, rub[lv])), h('kbd', {}, String(i + 1))))),
        h('div', { class: 'au-actions au-end' },
          current ? h('button', { type: 'button', class: 'btn btn-danger', onclick: () => finish(null) }, 'Quitar nivel') : null,
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => finish(undefined) }, 'Cancelar'))));
    root.append(pop);
    requestAnimationFrame(() => (pop.querySelector(`.au-pop-lv[aria-pressed="true"]`) || pop.querySelector('.au-pop-lv'))?.focus());
  }

  // ---------- Pintado ----------
  function paint() {
    const focusSid = document.activeElement?.dataset?.sid;
    const gb = gradebookFor(groupId, area);
    const crit = gb?.criterios || [];
    let body;
    if (!gb || !crit.length) body = emptyView(gb);
    else {
      const cr = crit.find((c) => c.id === st.crit);
      if (!cr) { st.crit = null; body = pickerView(); } else body = gridView(gb, cr);
    }
    const keepPop = root.querySelector('.au-pop-back');
    root.replaceChildren(ctxLine(), body);
    if (keepPop) root.append(keepPop);
    if (focusSid) root.querySelector(`.au-tile[data-sid="${focusSid}"]`)?.focus();
  }
  paint();
  return close;
}
