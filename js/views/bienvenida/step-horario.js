// Paso 4 · Tu horario: generador de franjas con vista previa y rejilla rápida de áreas (L–V)
import { store } from '../../store.js';
import { h, toast } from '../../ui.js';
import { AREAS, areaShort, areaColor, DIAS_LECTIVOS } from '../../school.js';
import { buildFranjas, applyFranjas } from '../../timetable.js';
import { field, errorBox, getDraft, setDraft } from './common.js';

const DIAS_ABBR = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const DEFAULTS = { inicio: '09:00', duracion: 60, sesiones: 5, recreoTras: 3, recreoDuracion: 30 };

/** Aplica el horario: franjas + recreos + clases del grupo. Reemplaza lo que creó el propio asistente. */
function applySchedule(st, franjas, cells) {
  // Si se vuelve a este paso, se retira antes lo creado la vez anterior (no se duplica ni quedan restos).
  st.sessionIds.forEach((id) => store.remove('schedule', id));
  const ids = applyFranjas(franjas).map((s) => s.id);
  const clases = franjas.filter((f) => f.tipo === 'clase');
  clases.forEach((f, i) => {
    for (let d = 0; d < 5; d++) {
      const area = cells[d][i];
      if (!area) continue;
      ids.push(store.add('schedule', {
        dia: d + 1, inicio: f.inicio, fin: f.fin, tipo: 'clase', area, groupId: st.groupId, titulo: '', aula: '',
      }).id);
    }
  });
  st.sessionIds = ids;
}

/** Reconstruye la configuración y la rejilla a partir de lo ya guardado (al volver a este paso). */
function savedSchedule(st) {
  const franjas = store.getSetting('horarioFranjas', []) || [];
  const clases = franjas.filter((f) => f.tipo === 'clase');
  if (!st.sessionIds.length || !clases.length) return {};
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const rec = franjas.find((f) => f.tipo === 'recreo');
  const cfg = {
    inicio: franjas[0].inicio, duracion: mins(clases[0].fin) - mins(clases[0].inicio), sesiones: clases.length,
    recreoTras: rec ? franjas.filter((f) => f.tipo === 'clase' && f.inicio < rec.inicio).length : 0,
    recreoDuracion: rec ? mins(rec.fin) - mins(rec.inicio) : DEFAULTS.recreoDuracion,
  };
  const mine = store.list('schedule').filter((s) => s.tipo === 'clase' && s.groupId === st.groupId);
  const cells = Array.from({ length: 5 }, (_, d) => clases.map((f) =>
    (mine.find((s) => s.dia === d + 1 && s.inicio === f.inicio && s.fin === f.fin) || {}).area || ''));
  return { cfg, cells };
}

export function stepHorario(ctx) {
  const saved = getDraft('horario', null) || savedSchedule(ctx.st);
  // (un número vacío se guardó como null: se ignora y vale el valor por defecto)
  const cfg = { ...DEFAULTS, ...Object.fromEntries(Object.entries(saved.cfg || {}).filter(([, v]) => v !== null)) };
  // cells[dia 0..4][índice de clase] = área completa ('' = vacío)
  const cells = Array.from({ length: 5 }, (_, d) => (saved.cells && Array.isArray(saved.cells[d]) ? saved.cells[d] : []));
  let activeDay = 0;
  const remember = () => setDraft('horario', { cfg, cells });

  // ---- Formulario de franjas
  const numInput = (key, min, max) => h('input', {
    class: 'input bv-input', type: 'number', min, max, inputmode: 'numeric', value: String(cfg[key]),
    oninput: (e) => { cfg[key] = e.target.value === '' ? NaN : Number(e.target.value); refresh(); },
  });
  const sel = (key, options) => h('select', {
    class: 'select bv-input', onchange: (e) => { cfg[key] = Number(e.target.value); refresh(); },
  }, options.map((m) => h('option', { value: m, selected: m === cfg[key] }, `${m} min`)));
  const inicio = h('input', {
    class: 'input bv-input', type: 'time', value: cfg.inicio,
    oninput: (e) => { cfg.inicio = e.target.value; refresh(); },
  });
  const durOpts = [45, 60].includes(cfg.duracion) ? [45, 60] : [45, 60, cfg.duracion];
  const recOpts = [20, 30, 45].includes(cfg.recreoDuracion) ? [20, 30, 45] : [20, 30, 45, cfg.recreoDuracion];

  const preview = h('div', { class: 'bv-franjas', 'aria-live': 'polite' });
  const error = errorBox();
  const gridBox = h('div', { class: 'bv-grid-box' });

  const form = h('div', { class: 'bv-hform' },
    field('Empiezas a las', inicio),
    field('Duración de cada sesión', sel('duracion', durOpts)),
    field('Número de sesiones', numInput('sesiones', 1, 10)),
    field('Recreo tras la sesión nº', numInput('recreoTras', 0, 10), '0 = sin recreo'),
    field('Duración del recreo', sel('recreoDuracion', recOpts)));

  // ---- Rejilla rápida
  const dayTabs = h('div', { class: 'segmented bv-daytabs', role: 'tablist', 'aria-label': 'Día de la semana' },
    DIAS_ABBR.map((a, d) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(d === activeDay), 'aria-label': DIAS_LECTIVOS[d],
      onclick: () => { activeDay = d; dayTabs.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === d))); gridBox.firstChild && (gridBox.firstChild.dataset.day = d); },
    }, a)));
  const copyBtn = h('button', {
    type: 'button', class: 'btn btn-sm',
    onclick: () => {
      for (let d = 1; d < 5; d++) cells[d] = [...cells[0]];
      remember(); paintGrid();
      toast('Lunes copiado a toda la semana');
    },
  }, 'Copiar lunes a toda la semana');

  let franjas = [];
  function paintGrid() {
    const clases = franjas.filter((f) => f.tipo === 'clase');
    if (!franjas.length) { gridBox.replaceChildren(); return; }
    let ci = 0;
    const rows = franjas.map((f) => {
      if (f.tipo !== 'clase') {
        // Una celda por día (como en las filas de clase) para que en móvil solo se vea la del día activo
        return h('tr', { class: 'is-break' }, h('th', { scope: 'row' }, f.inicio),
          DIAS_ABBR.map((_, d) => h('td', { dataset: { d } }, 'Recreo')));
      }
      const i = ci++;
      return h('tr', {}, h('th', { scope: 'row' }, f.inicio, h('small', {}, `Clase ${i + 1}`)),
        DIAS_ABBR.map((_, d) => {
          const area = cells[d][i] || '';
          const s = h('select', {
            class: 'select bv-sel', 'aria-label': `${DIAS_LECTIVOS[d]}, ${f.inicio} a ${f.fin}`,
            dataset: { t: area ? areaColor(area) : '' },
            onchange: (e) => { cells[d][i] = e.target.value; s.dataset.t = e.target.value ? areaColor(e.target.value) : ''; remember(); },
          }, h('option', { value: '' }, '—'),
          AREAS.map((a) => h('option', { value: a, selected: a === area }, areaShort(a))));
          return h('td', { dataset: { d } }, s);
        }));
    });
    const table = h('table', { class: 'bv-grid', dataset: { day: activeDay } },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Hora')),
        DIAS_ABBR.map((a, d) => h('th', { scope: 'col', dataset: { d }, 'aria-label': DIAS_LECTIVOS[d] }, a)))),
      h('tbody', {}, rows));
    gridBox.replaceChildren(table);
    copyBtn.disabled = !clases.length;
  }

  /** Recalcula las franjas con lo escrito y repinta la vista previa y la rejilla. */
  function refresh() {
    remember();
    try {
      franjas = buildFranjas(cfg);
      error.clear();
      preview.replaceChildren(...franjas.map((f) => h('span', { class: `chip ${f.tipo === 'recreo' ? 't5' : 't2'} bv-franja` },
        `${f.inicio}–${f.fin}`, h('span', { class: 'bv-franja-t' }, f.tipo === 'recreo' ? 'Recreo' : ''))));
    } catch (e) {
      franjas = []; error.show(e.message); preview.replaceChildren();
    }
    paintGrid();
  }
  refresh();

  const el = h('div', { class: 'bv-form bv-wide' },
    h('div', { class: 'bv-block' },
      h('h2', { class: 'bv-sub' }, '1. Tu jornada'), form, error,
      h('p', { class: 'bv-label' }, 'Así quedará un día'), preview),
    h('div', { class: 'bv-block' },
      h('div', { class: 'bv-sub-row' },
        h('h2', { class: 'bv-sub' }, '2. ¿Qué das en cada hora?'), copyBtn),
      h('p', { class: 'bv-hint' }, 'Rellena solo lo que quieras; los huecos vacíos puedes dejarlos para después.'),
      dayTabs, gridBox));

  return {
    title: 'Tu horario',
    lead: 'Cuéntanos cómo es tu jornada y qué área das cada hora. Podrás cambiarlo luego en Calendario.',
    el, wide: true,
    nextLabel: 'Terminar',
    skipLabel: 'Lo haré después',
    next() {
      if (!franjas.length) { error.show(error.textContent || 'Revisa las horas de la jornada.'); return false; }
      try { applySchedule(ctx.st, franjas, cells); } catch (e) { console.error(e); error.show('No se pudo crear el horario. Inténtalo de nuevo.'); return false; }
      setDraft('horario', null);
      return true;
    },
  };
}
