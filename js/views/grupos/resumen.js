// Tabula · Grupos · pestaña «Resumen» (totales del curso y cuadrícula mensual)
import { store } from '../../store.js';
import { h, icon, todayISO, fromISO } from '../../ui.js';
import { getGroup, getStudents, getEventsForDate, listName, ATTENDANCE } from '../../school.js';
import { colorOf, plural } from './common.js';
import { groupDocs, studentStats, monthsOfYear, daysOfMonth, isWeekend, yearRange } from './summary.js';

const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S']; // iniciales habituales en España (X = miércoles)
const ABSENTISMO_MIN = 3; // faltas injustificadas al mes para avisar

// El mes elegido se recuerda mientras dure la sesión de navegación
let rememberedMonth = null;

export function mountResumen(panel, groupId) {
  const group0 = getGroup(groupId);
  if (!group0) return () => {};
  const months = monthsOfYear(group0.cursoEscolar);
  const keys = months.map((m) => m.key);

  // Mes inicial: el actual si pertenece al curso; si no, el último con datos; si no, septiembre.
  const initialMonth = () => {
    if (rememberedMonth && keys.includes(rememberedMonth.key) && rememberedMonth.g === groupId) return rememberedMonth.key;
    const cur = todayISO().slice(0, 7);
    if (keys.includes(cur)) return cur;
    const withData = groupDocs(group0).map((d) => d.fecha.slice(0, 7));
    return withData.length ? withData[withData.length - 1] : keys[0];
  };
  let month = initialMonth();

  const totals = h('div', { class: 'gr-table-wrap' });
  const totalsNote = h('p', { class: 'gr-hint' });
  const monthSel = h('select', {
    class: 'select gr-month-select', 'aria-label': 'Mes',
    onchange: (e) => setMonth(e.target.value),
  }, months.map((m) => h('option', { value: m.key, selected: m.key === month }, m.label)));
  const step = (n) => { const i = keys.indexOf(month) + n; if (i >= 0 && i < keys.length) setMonth(keys[i]); };
  const monthHint = h('div', { class: 'gr-note-wrap' });
  const monthGrid = h('div', { class: 'gr-month-scroll', tabindex: '0', role: 'region', 'aria-label': 'Cuadrícula mensual de asistencia' });

  panel.replaceChildren(
    h('div', { class: 'card gr-card-list' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Total del curso')),
      totals, totalsNote),
    h('div', { class: 'card gr-card-list gr-month-card' },
      h('div', { class: 'card-head gr-month-head' }, h('h2', { class: 'card-title' }, 'Por meses'),
        h('div', { class: 'gr-month-pick' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Mes anterior', onclick: () => step(-1) }, icon('chevronLeft')),
          monthSel,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Mes siguiente', onclick: () => step(1) }, icon('chevronRight')))),
      monthHint, monthGrid,
      h('p', { class: 'gr-legend' }, ['P', 'F', 'R', 'J'].map((k) => h('span', { class: 'gr-legend-item' },
        h('span', { class: `gr-cell k${k}` }, k), ATTENDANCE[k].label)))));

  function setMonth(k) {
    month = k; rememberedMonth = { key: k, g: groupId };
    monthSel.value = k;
    paintMonth();
  }

  function paintTotals() {
    const group = getGroup(groupId); if (!group) return;
    const students = getStudents(groupId);
    const docs = groupDocs(group);
    if (!students.length) { totals.replaceChildren(h('div', { class: 'empty' }, 'Añade alumnado para ver el resumen.')); totalsNote.textContent = ''; return; }
    totals.replaceChildren(h('table', { class: 'gr-table gr-totals' },
      h('caption', { class: 'sr-only' }, 'Totales de asistencia por alumno en el curso'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Alumno'),
        ['Faltas', 'Retrasos', 'Justif.', 'Asistencia'].map((t) => h('th', { scope: 'col', class: 'num' }, t)))),
      h('tbody', {}, students.map((s) => {
        const st = studentStats(docs, s.id);
        return h('tr', {}, h('th', { scope: 'row' }, listName(s)),
          h('td', { class: 'num' }, String(st.faltas)), h('td', { class: 'num' }, String(st.retrasos)),
          h('td', { class: 'num' }, String(st.justificadas)),
          h('td', { class: 'num' }, st.pct === null ? '—' : `${st.pct} %`));
      }))));
    totalsNote.textContent = docs.length
      ? `Sobre ${plural(docs.length, 'día registrado', 'días registrados')} del curso ${group.cursoEscolar}. Los retrasos cuentan como asistencia.`
      : 'Todavía no se ha pasado lista este curso.';
  }

  function paintMonth() {
    const group = getGroup(groupId); if (!group) return;
    const students = getStudents(groupId);
    const docs = groupDocs(group);
    const byDate = new Map(docs.map((d) => [d.fecha, d]));
    const { start, end } = yearRange(group.cursoEscolar);
    // Columnas: días laborables sin evento «no lectivo», más cualquier día con lista pasada.
    const days = daysOfMonth(month).filter((iso) => iso >= start && iso <= end && (byDate.has(iso)
      || (!isWeekend(iso) && !getEventsForDate(iso).some((e) => e.tipo === 'nolectivo'))));
    if (!students.length) { monthGrid.replaceChildren(h('div', { class: 'empty' }, 'Añade alumnado para ver la cuadrícula.')); monthHint.replaceChildren(); return; }

    const faltasMes = (s) => days.reduce((n, iso) => n + (byDate.get(iso)?.registros?.[s.id] === 'F' ? 1 : 0), 0);
    const alertas = students.filter((s) => faltasMes(s) >= ABSENTISMO_MIN);
    monthHint.replaceChildren(alertas.length
      ? h('p', { class: 'gr-note gr-alert' }, icon('flag', 16),
        h('span', {}, h('strong', {}, `Posible absentismo: `), `${alertas.map(listName).join('; ')} · ${ABSENTISMO_MIN} o más faltas injustificadas este mes. Revisa el protocolo de absentismo del centro.`))
      : h('p', { class: 'gr-hint' }, `Se resaltan los alumnos con ${ABSENTISMO_MIN} o más faltas injustificadas (F) en el mes.`));

    const dayHead = (iso) => { const d = fromISO(iso); return h('th', { scope: 'col', class: `gr-day${byDate.has(iso) ? '' : ' empty-day'}`, title: iso },
      h('span', { class: 'dow' }, DOW[d.getDay()]), h('span', {}, String(d.getDate()))); };
    monthGrid.replaceChildren(h('table', { class: 'gr-table gr-month' },
      h('caption', { class: 'sr-only' }, 'Asistencia diaria del mes'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'sticky' }, 'Alumno'), days.map(dayHead), h('th', { scope: 'col', class: 'num' }, 'F'))),
      h('tbody', {}, students.map((s) => {
        const f = faltasMes(s);
        const alert = f >= ABSENTISMO_MIN;
        return h('tr', { class: alert ? 'is-alert' : null },
          h('th', { scope: 'row', class: 'sticky' }, alert ? icon('flag', 13, 'gr-alert-ico') : null, listName(s),
            alert ? h('span', { class: 'sr-only' }, ' (posible absentismo)') : null),
          days.map((iso) => {
            const doc = byDate.get(iso);
            if (!doc) return h('td', { class: 'gr-cell-td' }, h('span', { class: 'gr-cell none' }, '·'));
            const k = doc.registros?.[s.id] || 'P';
            return h('td', { class: 'gr-cell-td' }, h('span', { class: `gr-cell k${k}`, title: ATTENDANCE[k].label }, k));
          }),
          h('td', { class: 'num' }, String(f)));
      }))));
    if (!days.length) monthGrid.replaceChildren(h('div', { class: 'empty' }, 'No hay días lectivos en este mes.'));
  }

  const repaint = () => { paintTotals(); paintMonth(); };
  repaint();
  const unsubs = ['attendance', 'students', 'events'].map((c) => store.subscribe(c, repaint));
  return () => unsubs.forEach((u) => u());
}
