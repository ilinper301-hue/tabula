// Tabula · Calendario escolar de Andalucía: banner (Calendario), tarjeta de Ajustes y fechas locales del centro.
import { store } from '../../store.js';
import { h, icon, toast, fromISO, MESES } from '../../ui.js';
import { currentSchoolYear } from '../../school.js';
import { PRESETS, presetLoaded, applyPreset, ORIGEN } from '../../calendario-escolar.js';

const dm = (iso) => { const d = fromISO(iso); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
const range = (e) => (e.fechaFin && e.fechaFin > e.fecha ? `${dm(e.fecha)} – ${dm(e.fechaFin)}` : dm(e.fecha));
const yearLabel = (y) => `${y.slice(0, 4)}-${y.slice(5)}`;

/** Carga (o recarga) el calendario de un curso con aviso para deshacer. */
export function loadCalendar(year) {
  const res = applyPreset(year);
  toast(res.removed ? 'Calendario escolar recargado' : 'Calendario escolar cargado', { label: 'Deshacer', run: () => res.undo() });
  return res;
}

/** Descripción de una línea de lo que añade el calendario. */
export function presetBlurb(year) {
  const p = PRESETS[year];
  return `Añade el inicio (${dm(p.inicio)}) y el fin de curso (${dm(p.fin)}), Navidad, Semana Santa, los festivos y una propuesta de fechas de evaluación. Los festivos locales y los días de libre disposición los añades tú.`;
}

/** Banner discreto para Calendario: solo aparece si el curso actual tiene calendario y aún no se ha cargado. */
export function calendarBanner() {
  const el = h('div');
  const year = currentSchoolYear();
  function paint() {
    if (!PRESETS[year] || presetLoaded(year)) { el.replaceChildren(); return; }
    el.replaceChildren(h('div', { class: 'tu-banner', role: 'region', 'aria-label': 'Calendario escolar' },
      h('div', { class: 'tu-banner-text' }, h('strong', {}, 'Calendario escolar'), presetBlurb(year)),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => loadCalendar(year) }, icon('calendario', 16), `Cargar el calendario escolar de Andalucía ${yearLabel(year)}`)));
  }
  paint();
  const unsub = store.subscribe('events', paint);
  return { el, destroy: unsub };
}

const SLOTS = [
  ['local1', 'Festivo local 1', 'Festivo local'], ['local2', 'Festivo local 2', 'Festivo local'],
  ['libre1', 'Libre disposición 1', 'Día de libre disposición'], ['libre2', 'Libre disposición 2', 'Día de libre disposición'],
];

function yearBlock(year) {
  const p = PRESETS[year];
  const box = h('div');
  function paint() {
    const loaded = presetLoaded(year);
    const events = store.list('events');
    const generated = events.filter((e) => e.origen === ORIGEN && e.cursoEscolar === year && e.tipo === 'nolectivo'
      && !/^(Antes del inicio|Vacaciones de verano)/.test(e.titulo)).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const parts = [h('h3', { class: 'section-label' }, p.nombre)];
    if (!loaded) {
      parts.push(h('p', { class: 'settings-text' }, presetBlurb(year)),
        h('div', { class: 'settings-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => loadCalendar(year) }, icon('calendario', 16), `Cargar el calendario escolar de Andalucía ${yearLabel(year)}`)));
    } else {
      parts.push(h('div', { class: 'tu-state' },
        h('span', { class: 'tu-ok' }, icon('check', 16), 'Cargado'), h('span', { class: 'tu-hint' }, '·'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => loadCalendar(year) }, 'Volver a cargar')),
      h('ul', { class: 'tu-days', 'aria-label': 'Días no lectivos del calendario' }, generated.map((e) => h('li', {}, h('time', { datetime: e.fecha }, range(e)), h('span', {}, e.titulo)))),
      h('h3', { class: 'section-label' }, 'Fechas de tu centro'),
      h('p', { class: 'settings-text' }, 'Los 2 festivos locales y los 2 días de libre disposición los fija tu centro. Se marcan como días no lectivos.'),
      h('div', { class: 'tu-local' }, SLOTS.map(([slot, label, titulo]) => {
        const find = () => store.list('events').find((e) => e.origen === 'centro' && e.cursoEscolar === year && e.slot === slot);
        const ev0 = find();
        const input = h('input', { class: 'input', type: 'date', id: `cs-${year}-${slot}`, value: ev0 ? ev0.fecha : '', min: p.inicio, max: p.fin,
          onchange: () => {
            const v = input.value, ev = find();
            if (v && (v < p.inicio || v > p.fin)) return; // se avisa al salir del campo
            if (!v) { if (ev) { store.remove('events', ev.id); toast('Fecha quitada'); } return; }
            const data = { titulo, fecha: v, fechaFin: null, hora: null, tipo: 'nolectivo', groupId: null, notas: '', origen: 'centro', cursoEscolar: year, slot };
            if (ev) store.update('events', ev.id, data); else store.add('events', data);
            toast('Fecha guardada');
          },
          onblur: () => {
            const v = input.value, ev = find();
            if (v && (v < p.inicio || v > p.fin)) { toast(`Elige una fecha del curso (${dm(p.inicio)} – ${dm(p.fin)})`); input.value = ev ? ev.fecha : ''; }
          } });
        return h('div', { class: 'field' }, h('label', { for: input.id }, label), input);
      })));
    }
    box.replaceChildren(...parts);
  }
  paint();
  return { el: box, repaint: paint };
}

/** Tarjeta «Calendario escolar» de Ajustes. */
export function calendarioEscolarCard() {
  const cur = currentSchoolYear();
  const years = Object.keys(PRESETS).filter((y) => y >= cur);
  const blocks = years.map(yearBlock);
  const el = h('section', { class: 'card', id: 'ajustes-calendario' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Calendario escolar')),
    blocks.length ? blocks.map((b) => b.el) : h('p', { class: 'settings-text' }, 'Todavía no hay un calendario oficial disponible para este curso. Puedes añadir los días no lectivos desde Calendario.'));
  // El campo de fecha en edición no debe perder el foco: solo se repinta ante cambios ajenos
  const unsub = store.subscribe('events', () => { if (!el.contains(document.activeElement) || document.activeElement.tagName !== 'INPUT') blocks.forEach((b) => b.repaint()); });
  return { el, destroy: unsub };
}
