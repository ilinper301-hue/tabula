// Tabula · Grupos · pestaña «Asistencia» (Pasar lista)
// Cada cambio se guarda solo (con 300 ms de espera) mediante saveAttendance().
import { store } from '../../store.js';
import { h, icon, todayISO, fromISO, toISO, addDaysISO, relativeDay, DIAS, MESES } from '../../ui.js';
import { getGroup, getStudents, getAttendance, saveAttendance, listName, ATTENDANCE } from '../../school.js';
import { avatar, colorOf, plural, cap, go } from './common.js';

const ORDER = ['P', 'F', 'R', 'J'];
const valid = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && toISO(fromISO(iso)) === iso;

export function mountAsistencia(panel, groupId, fechaParam) {
  const fecha = valid(fechaParam) ? fechaParam : todayISO();
  let registros = {};           // { studentId: 'P'|'F'|'R'|'J' }
  let notas = '';
  let timer = null;             // temporizador del guardado diferido
  let selfWrite = false;        // true mientras escribimos nosotros (para ignorar nuestro propio evento)
  const rows = new Map();       // studentId -> { row, btns }

  const loadFromStore = () => {
    const doc = getAttendance(groupId, fecha);
    registros = { ...(doc?.registros || {}) };
    notas = doc?.notas || '';
  };
  loadFromStore();

  // ---------- Barra de fecha
  const nav = (iso) => { flush(); go({ id: groupId, tab: 'asistencia', fecha: iso === todayISO() ? '' : iso }); };
  const dateInput = h('input', {
    class: 'input gr-date-input', type: 'date', value: fecha, 'aria-label': 'Fecha de la lista',
    onchange: (e) => { if (valid(e.target.value)) nav(e.target.value); },
  });
  const d = fromISO(fecha);
  const longLabel = `${cap(DIAS[d.getDay()])}, ${d.getDate()} de ${MESES[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' de ' + d.getFullYear() : ''}`;
  const rel = relativeDay(fecha);
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const dateBar = h('div', { class: 'gr-datebar' },
    h('button', { type: 'button', class: 'icon-btn gr-nav', 'aria-label': 'Día anterior', onclick: () => nav(addDaysISO(fecha, -1)) }, icon('chevronLeft')),
    h('div', { class: 'gr-date' }, dateInput, h('span', { class: 'gr-date-label' }, longLabel, ['Hoy', 'Mañana', 'Ayer'].includes(rel) ? h('span', { class: 'chip t1' }, rel) : null)),
    h('button', { type: 'button', class: 'icon-btn gr-nav', 'aria-label': 'Día siguiente', onclick: () => nav(addDaysISO(fecha, 1)) }, icon('chevronRight')),
    fecha !== todayISO() ? h('button', { type: 'button', class: 'btn', onclick: () => nav(todayISO()) }, 'Hoy') : null);
  const weekendHint = weekend ? h('p', { class: 'gr-note gr-weekend' }, icon('calendario', 16),
    'Es fin de semana: normalmente no hay clase. Puedes pasar lista igualmente.') : null;

  // ---------- Resumen, estado de guardado y acciones
  const summary = h('div', { class: 'gr-summary', 'aria-live': 'polite' });
  const status = h('span', { class: 'gr-status' });
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => saveNow() }, icon('check', 16), 'Guardar lista');
  const allPresent = h('button', { type: 'button', class: 'btn', onclick: () => {
    getStudents(groupId).forEach((s) => { registros[s.id] = 'P'; });
    paintRows(); paintSummary(); saveNow();
  } }, 'Todos presentes');
  const bar = h('div', { class: 'gr-attbar' }, summary, h('div', { class: 'gr-attbar-actions' }, status, allPresent, saveBtn));

  const grid = h('div', { class: 'gr-att-grid' });
  const notesInput = h('input', {
    class: 'input', type: 'text', id: 'gr-att-notes', value: notas, maxlength: 300,
    placeholder: 'Nota del día (opcional): excursión, salida anticipada…',
    oninput: (e) => { notas = e.target.value; schedule(); },
  });
  const notesField = h('div', { class: 'field gr-att-notes' }, h('label', { for: 'gr-att-notes' }, 'Nota del día'), notesInput);

  panel.replaceChildren(...[dateBar, weekendHint, bar, grid, notesField].filter(Boolean));

  // ---------- Guardado
  const exists = () => !!getAttendance(groupId, fecha);
  function paintStatus(kind, extra = '') {
    status.className = `gr-status ${kind}`;
    if (kind === 'pending') status.replaceChildren('Guardando…');
    else if (kind === 'saved') status.replaceChildren(icon('check', 14), `Guardado${extra}`);
    else status.replaceChildren(icon('clock', 14), 'Lista sin guardar');
    saveBtn.hidden = exists() && !timer;
  }
  function saveNow() {
    clearTimeout(timer); timer = null;
    // Todo el alumnado actual queda anotado de forma explícita; se conservan registros de alumnos ya borrados.
    const full = { ...registros };
    getStudents(groupId).forEach((s) => { full[s.id] = full[s.id] || 'P'; });
    selfWrite = true;
    try { saveAttendance(groupId, fecha, full, notas.trim()); } finally { selfWrite = false; }
    registros = full;
    const t = new Date();
    paintStatus('saved', ` · ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
  }
  function schedule() {
    paintStatus('pending');
    clearTimeout(timer);
    timer = setTimeout(saveNow, 300);
  }
  function flush() { if (timer) saveNow(); }

  // ---------- Pintado
  const stateOf = (id) => registros[id] || 'P';
  function paintSummary() {
    const students = getStudents(groupId);
    const c = { P: 0, F: 0, R: 0, J: 0 };
    students.forEach((s) => { c[stateOf(s.id)]++; });
    const parts = [h('strong', {}, plural(c.P, 'presente', 'presentes'))];
    if (c.F) parts.push(plural(c.F, 'falta', 'faltas'));
    if (c.R) parts.push(plural(c.R, 'retraso', 'retrasos'));
    if (c.J) parts.push(plural(c.J, 'justificada', 'justificadas'));
    summary.replaceChildren(...parts.flatMap((p, i) => (i ? [h('span', { class: 'gr-dot', 'aria-hidden': 'true' }, '·'), p] : [p])));
  }
  function paintRow(id) {
    const r = rows.get(id); if (!r) return;
    const st = stateOf(id);
    r.row.dataset.state = st;
    ORDER.forEach((k) => r.btns[k].setAttribute('aria-pressed', String(k === st)));
  }
  function setState(id, st) {
    registros[id] = st;
    paintRow(id); paintSummary(); schedule();
  }
  function paintRows() {
    const group = getGroup(groupId);
    const color = colorOf(group);
    const students = getStudents(groupId);
    rows.clear();
    if (!students.length) {
      grid.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'empty' }, icon('grupos', 40),
        h('strong', {}, 'No hay alumnado en este grupo'), 'Añade a tu alumnado en la pestaña «Alumnado» para poder pasar lista.')));
      return;
    }
    grid.replaceChildren(...students.map((s) => {
      const btns = {};
      const seg = h('div', { class: 'gr-seg', role: 'group', 'aria-label': `Asistencia de ${listName(s)}` },
        ORDER.map((k) => (btns[k] = h('button', {
          type: 'button', class: `gr-seg-btn k${k}`, 'aria-label': ATTENDANCE[k].label, title: ATTENDANCE[k].label,
          onclick: () => setState(s.id, k),
        }, ATTENDANCE[k].short))));
      const main = h('button', {
        type: 'button', class: 'gr-att-main', title: 'Toca para cambiar: presente, falta, retraso, justificada',
        'aria-label': `${listName(s)}: cambiar estado`,
        onclick: () => setState(s.id, ORDER[(ORDER.indexOf(stateOf(s.id)) + 1) % ORDER.length]),
      }, avatar(s, color), h('span', { class: 'gr-att-name' }, listName(s)));
      const row = h('div', { class: 'gr-att-row' }, main, seg);
      rows.set(s.id, { row, btns });
      return row;
    }));
    students.forEach((s) => paintRow(s.id));
  }

  paintRows(); paintSummary();
  if (exists()) paintStatus('saved', ''); else paintStatus('unsaved');

  // ---------- Suscripciones: refrescar solo la rejilla (la nota conserva el foco)
  const onAtt = () => {
    if (selfWrite || timer) return;
    const before = JSON.stringify(registros);
    loadFromStore();
    if (JSON.stringify(registros) !== before) { paintRows(); paintSummary(); }
    if (document.activeElement !== notesInput) notesInput.value = notas;
    paintStatus(exists() ? 'saved' : 'unsaved');
  };
  const onStudents = () => { paintRows(); paintSummary(); };
  const unsubs = [store.subscribe('attendance', onAtt), store.subscribe('students', onStudents), store.subscribe('groups', paintRows)];
  // Si se cierra la pestaña o se oculta con un guardado pendiente, se guarda ya.
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);

  return () => {
    flush();
    unsubs.forEach((u) => u());
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flush);
  };
}
