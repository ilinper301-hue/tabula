// Tabula · vista «Cuaderno» (cuaderno de evaluación del docente)
//
// Ruta: #/cuaderno?grupo=<groupId>&area=<área>&ev=1|2|3|final
// Módulos auxiliares en ./cuaderno/ :
//   model.js          datos: contexto, escritura de notas, altas/bajas con deshacer
//   grid.js           rejilla con entrada rápida por teclado
//   panel.js          panel de puntuación táctil y de rúbricas
//   sheet-*.js        hojas: actividad, configuración, desglose del alumno
//   export.js         CSV
import { store } from '../store.js';
import { h, icon, openSheet } from '../ui.js';
import { getGroups, getGroup, AREAS, areaShort, areaColor, currentSchoolYear } from '../school.js';
import { EVALUACIONES, configWarnings } from '../grading.js';
import {
  currentEv, loadContext, areasWithGradebook, createGradebook, evaluacionDefaults,
} from './cuaderno/model.js';
import { createGrid } from './cuaderno/grid.js';
import { createPanel } from './cuaderno/panel.js';
import { openActivitySheet } from './cuaderno/sheet-activity.js';
import { openConfigSheet } from './cuaderno/sheet-config.js';
import { openStudentSheet } from './cuaderno/sheet-student.js';
import { downloadCsv } from './cuaderno/export.js';
import { href, segmented, plural } from './cuaderno/common.js';

// Lo último que eligió el docente, para volver al mismo sitio desde otras secciones.
const last = { groupId: null, area: null, ev: null };
let lastVista = 'actividades';

export function render(container, params = new URLSearchParams()) {
  container.className = (container.className.replace(/\bcuaderno-view\b/g, '') + ' cuaderno-view').trim();

  // ---------- Selección actual ----------
  const st = { groupId: null, area: null, ev: null, vista: lastVista };
  function resolveSelection() {
    const groups = getGroups();
    const wanted = params.get('grupo') || last.groupId;
    const g = groups.find((x) => x.id === st.groupId) || groups.find((x) => x.id === wanted)
      || groups.find((x) => x.tutoria) || groups[0] || null;
    st.groupId = g ? g.id : null;
    if (!g) return;
    const withGb = areasWithGradebook(g.id);
    const a = params.get('area');
    st.area = (a && AREAS.includes(a) ? a : null) || st.area
      || (last.groupId === g.id && last.area) || withGb[0] || AREAS[0];
    const e = params.get('ev') || last.ev;
    st.ev = EVALUACIONES.some((x) => x.id === e) ? e : (st.ev || currentEv());
    Object.assign(last, { groupId: g.id, area: st.area, ev: st.ev });
  }
  resolveSelection();

  let ctx = null;
  let grid = null;
  let dirty = false;
  let queued = false;

  // ---------- Panel de puntuación ----------
  const panel = createPanel({
    getCtx: () => ctx,
    onFocusCell: (c, reveal) => {
      if (!grid) return;
      if (!c) grid.clearActive();
      else { grid.setActive(c.actId, c.studentId); if (reveal) grid.reveal(c.actId, c.studentId); }
    },
  });
  const openPanel = (act, rowIndex) => panel.open(act.id, rowIndex);

  // ---------- Acciones ----------
  const sel = () => ({ grupo: st.groupId, area: st.area, ev: st.ev });
  const go = (patch) => { location.hash = href({ ...sel(), ...patch }).slice(1); };
  // Las acciones leen datos frescos: el repintado puede estar aplazado mientras se edita una celda.
  const fresh = () => { ctx = loadContext(st); return ctx; };
  const newActivity = () => openActivitySheet({ gb: fresh().gb, ev: st.ev });
  const openConfig = () => { const c = fresh(); openConfigSheet({ gb: c.gb, activities: c.all }); };

  // ---------- Pintado ----------
  function pageHead(group) {
    return h('header', { class: 'page-head cb-head' },
      h('div', {}, h('div', { class: 'eyebrow' }, group ? `${group.nombre} · curso ${group.cursoEscolar || currentSchoolYear()}` : `Curso ${currentSchoolYear()}`),
        h('h1', { class: 'page-title' }, 'Cuaderno')),
      ctx.gb ? h('div', { class: 'cb-actions-top' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: newActivity, 'aria-label': 'Nueva actividad' }, icon('plus', 16), h('span', {}, 'Nueva actividad')),
        h('button', { type: 'button', class: 'btn cb-btn-icon', onclick: openConfig, 'aria-label': 'Configurar cuaderno' }, icon('ajustes', 16), h('span', { class: 'cb-lbl' }, 'Configurar')),
        h('button', { type: 'button', class: 'btn cb-btn-icon', 'aria-label': 'Exportar a CSV', onclick: () => downloadCsv(fresh(), getGroup(st.groupId), st.area, st.ev) },
          icon('download', 16), h('span', { class: 'cb-lbl' }, 'Exportar'))) : null);
  }

  function toolbar(groups) {
    const groupSel = h('select', { class: 'select cb-group', 'aria-label': 'Grupo', onchange: (e) => go({ grupo: e.target.value, area: null }) },
      groups.map((g) => h('option', { value: g.id, selected: g.id === st.groupId }, g.nombre)));

    const withGb = areasWithGradebook(st.groupId);
    const shown = [...withGb.filter((a) => AREAS.includes(a)), ...(withGb.includes(st.area) ? [] : [st.area])];
    const areaChips = h('div', { class: 'cb-areas', role: 'group', 'aria-label': 'Área' },
      shown.map((a) => h('button', {
        type: 'button', class: `cb-area ${areaColor(a)}`, 'aria-pressed': String(a === st.area), title: a,
        onclick: () => go({ area: a }),
      }, areaShort(a), withGb.includes(a) ? null : h('span', { class: 'cb-area-new' }, 'sin cuaderno'))),
      AREAS.length > shown.length ? h('button', { type: 'button', class: 'cb-area cb-area-add', onclick: openAreaPicker }, icon('plus', 14), 'Área') : null);

    const evSeg = segmented(EVALUACIONES.map((e) => [e.id, e.id === 'final' ? 'Final' : e.label.replace(' evaluación', '')]),
      st.ev, (v) => go({ ev: v }), 'Evaluación');
    evSeg.classList.add('cb-ev');
    evSeg.querySelectorAll('button').forEach((b, i) => { b.setAttribute('aria-label', EVALUACIONES[i].label); });

    const row2 = [evSeg];
    if (ctx.gb && ctx.gb.modo === 'criterios') {
      const vSeg = segmented([['actividades', 'Actividades'], ['criterios', 'Criterios'], ['competencias', 'Competencias']], st.vista, (v) => {
        st.vista = lastVista = v; paint();
      }, 'Ver por');
      vSeg.classList.add('cb-vista');
      row2.push(vSeg);
    }
    return h('div', { class: 'cb-toolbar' },
      h('div', { class: 'cb-tb-row' }, groupSel, areaChips), h('div', { class: 'cb-tb-row' }, row2));
  }

  function openAreaPicker() {
    const withGb = areasWithGradebook(st.groupId);
    const rest = AREAS.filter((a) => !withGb.includes(a) && a !== st.area);
    const close = openSheet('Añadir área', h('div', { class: 'cb-area-list' },
      h('p', { class: 'cb-hint' }, 'Elige el área para la que quieres llevar un cuaderno.'),
      rest.map((a) => h('button', { type: 'button', class: 'cb-area-opt', onclick: () => { close(); go({ area: a }); } },
        h('span', { class: `chip ${areaColor(a)}` }, areaShort(a)), h('span', {}, a)))));
  }

  function emptyNoGroups() {
    return h('div', { class: 'card' }, h('div', { class: 'empty cb-empty' }, icon('cuaderno', 44),
      h('strong', {}, 'Primero crea un grupo'),
      'El cuaderno de evaluación necesita un grupo con su alumnado.',
      h('div', { class: 'cb-empty-actions' }, h('a', { class: 'btn btn-primary', href: '#/grupos' }, 'Ir a Grupos'))));
  }

  function emptyNoGradebook(group) {
    const d = evaluacionDefaults();
    const choice = { escala: d.escala, modo: d.modo };
    const escala = segmented([['niveles', 'Niveles'], ['numerica', 'Notas']], choice.escala, (v) => { choice.escala = v; }, 'Escala');
    const modo = segmented([['porcentajes', 'Por porcentajes'], ['criterios', 'Por criterios (Séneca)']], choice.modo, (v) => { choice.modo = v; }, 'Modo');
    return h('div', { class: 'card cb-create' },
      h('div', { class: 'cb-create-head' }, icon('cuaderno', 32),
        h('div', {}, h('h2', { class: 'card-title' }, `Cuaderno de ${areaShort(st.area)}`),
          h('p', { class: 'cb-hint' }, `Aún no tienes cuaderno de ${st.area} para ${group.nombre} en el curso ${group.cursoEscolar || currentSchoolYear()}. Se creará con instrumentos de evaluación predefinidos que podrás cambiar después.`))),
      h('div', { class: 'cb-create-opts' },
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Escala para anotar'), escala),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Cálculo de la nota'), modo)),
      h('button', {
        type: 'button', class: 'btn btn-primary',
        onclick: () => createGradebook(st.groupId, st.area, { escala: choice.escala, modo: choice.modo, final: d.final }),
      }, icon('plus', 16), `Crear cuaderno de ${areaShort(st.area)}`));
  }

  function warningsBanner() {
    const w = configWarnings(ctx.gb, ctx.all);
    if (!w.length) return null;
    return h('div', { class: 'cb-warn', role: 'status' },
      h('div', { class: 'cb-warn-text' }, w.map((t) => h('p', {}, t))),
      h('button', { type: 'button', class: 'link-btn', onclick: openConfig }, 'Configurar'));
  }

  function gridBody() {
    if (!ctx.students.length) {
      return h('div', { class: 'card' }, h('div', { class: 'empty cb-empty' }, icon('grupos', 40),
        h('strong', {}, 'Este grupo aún no tiene alumnado'), 'Añade a tu alumnado para empezar a anotar notas.',
        h('div', { class: 'cb-empty-actions' }, h('a', { class: 'btn btn-primary', href: `#/grupos?id=${st.groupId}` }, 'Añadir alumnado'))));
    }
    if (st.vista === 'actividades' && !ctx.visible.length) {
      const evLabel = EVALUACIONES.find((e) => e.id === st.ev)?.label;
      return h('div', { class: 'card' }, h('div', { class: 'empty cb-empty' }, icon('cuaderno', 40),
        h('strong', {}, 'Aún no hay actividades'),
        st.ev === 'final' ? 'Crea la primera actividad del curso.' : `Crea la primera actividad de la ${evLabel}.`,
        h('div', { class: 'cb-empty-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: newActivity }, icon('plus', 16), 'Nueva actividad'))));
    }
    if (st.vista !== 'actividades' && !(ctx.gb.criterios || []).length) {
      return h('div', { class: 'card' }, h('div', { class: 'empty cb-empty' }, icon('cuaderno', 40),
        h('strong', {}, 'Sin criterios de evaluación'), 'Añade o pega los criterios del área para verlos aquí.',
        h('div', { class: 'cb-empty-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: openConfig }, 'Configurar'))));
    }
    grid = createGrid(ctx, {
      vista: st.vista, onActivity: (act) => openActivitySheet({ gb: fresh().gb, activity: ctx.all.find((a) => a.id === act.id) || act, ev: st.ev }),
      onBreakdown: (stu) => openStudentSheet({ ctx: fresh(), student: stu, ev: st.ev }),
      onOpenPanel: openPanel,
    });
    return grid.el;
  }

  /** Repinta toda la pantalla conservando la posición de desplazamiento de la rejilla. */
  function paint() {
    const pos = grid ? { l: grid.el.scrollLeft, t: grid.el.scrollTop } : null;
    resolveSelection();
    const groups = getGroups();
    grid = null;
    if (!groups.length) { ctx = { gb: null, students: [], all: [], visible: [], gradesByAct: {}, results: {}, ev: st.ev }; panel.close(); container.replaceChildren(pageHead(null), emptyNoGroups()); return; }
    const group = getGroup(st.groupId);
    ctx = loadContext(st);
    if (ctx.gb && ctx.gb.modo !== 'criterios') st.vista = 'actividades';
    const parts = [pageHead(group), toolbar(groups)];
    if (!ctx.gb) { panel.close(); parts.push(emptyNoGradebook(group)); }
    else parts.push(warningsBanner(), gridBody());
    container.replaceChildren(...parts.filter(Boolean));
    if (grid && pos) { grid.el.scrollLeft = pos.l; grid.el.scrollTop = pos.t; }
    panel.sync();
  }

  // ---------- Suscripciones ----------
  // Cambios de notas: solo se actualizan los valores de las celdas (sin tocar el foco).
  const onGrades = () => {
    if (!grid) return;
    const next = loadContext(st);
    if (!next.gb) return; // el cuaderno se está borrando: llegará un repintado completo
    ctx = next;
    grid.update(ctx);
  };
  // Cambios estructurales: repintado completo, aplazado mientras se escribe en una celda.
  const requestPaint = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (grid && grid.hasFocus()) { dirty = true; return; }
      paint();
    });
  };
  container.addEventListener('focusout', () => setTimeout(() => {
    if (dirty && !(grid && grid.hasFocus())) { dirty = false; paint(); }
  }, 0));

  paint();
  const unsubs = [
    store.subscribe('grades', onGrades),
    store.subscribe('observaciones', onGrades), // columna «Obs.» (solo lectura)
    ...['gradebooks', 'activities', 'students', 'groups'].map((c) => store.subscribe(c, requestPaint)),
  ];

  return () => {
    unsubs.forEach((u) => u());
    panel.close();
    container.classList.remove('cuaderno-view');
  };
}
