// Tabula · Tutoría · pestaña «Reuniones»
import { store } from '../../store.js';
import { h, icon, todayISO, fromISO, MESES } from '../../ui.js';
import { getStudents } from '../../school.js';
import { splitReuniones, pendingAgreements, reunionEventTitle, MODALIDADES } from '../../tutoria.js';
import { byId, shortDate, pill } from './common.js';
import { getReuniones, toggleAgreement } from './data.js';
import { openReunion } from './reunion-sheet.js';

export function mountReuniones(panel, { groupId }) {
  const body = h('div', { class: 'tu-stack' });
  panel.replaceChildren(
    h('div', { class: 'tu-toolbar' },
      h('p', { class: 'tu-lead' }, 'Reuniones con familias, equipo docente y orientación.'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openReunion({ groupId }) }, icon('plus', 16), 'Nueva reunión')),
    body);

  function row(r, students, { cerrar = false } = {}) {
    const d = fromISO(r.fecha);
    const done = (r.acuerdos || []).filter((a) => a.hecho).length;
    const sub = [r.hora, MODALIDADES[r.modalidad], r.motivo].filter(Boolean).join(' · ');
    const open = () => openReunion({ groupId, reunionId: r.id });
    return h('div', { class: `tu-row${r.estado === 'cancelada' ? ' is-cancel' : ''}` },
      h('button', { type: 'button', class: 'tu-row-main', onclick: open, 'aria-label': `Abrir reunión: ${reunionEventTitle(r, students)}, ${shortDate(r.fecha)}` },
        h('span', { class: 'tu-date', 'aria-hidden': 'true' }, h('strong', {}, String(d.getDate())), h('span', {}, MESES[d.getMonth()].slice(0, 3))),
        h('span', { class: 'tu-row-text' },
          h('span', { class: 'tu-row-title' }, reunionEventTitle(r, students)),
          sub ? h('span', { class: 'tu-row-sub' }, sub) : null),
        h('span', { class: 'tu-row-end' },
          r.estado === 'cancelada' ? pill('Cancelada', 't5') : null,
          (r.acuerdos || []).length ? pill(`${done}/${r.acuerdos.length} ${r.acuerdos.length === 1 ? 'acuerdo' : 'acuerdos'}`, done === r.acuerdos.length ? 't3' : 't2', 'check') : null)),
      cerrar ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => openReunion({ groupId, reunionId: r.id, cerrar: true }) }, '¿Cómo fue?') : null);
  }

  const section = (label, items, { alert = false, empty = null } = {}) => {
    if (!items.length && !empty) return null;
    return h('section', { class: 'tu-section' },
      h('h2', { class: `section-label${alert ? ' alert' : ''}` }, label),
      items.length ? h('div', { class: 'card tu-list' }, items) : h('div', { class: 'card' }, h('p', { class: 'tu-empty' }, empty)));
  };

  function agreementsCard(pend, students) {
    if (!pend.length) return null;
    return h('section', { class: 'tu-section' },
      h('h2', { class: 'section-label' }, `Acuerdos pendientes · ${pend.length}`),
      h('div', { class: 'card tu-list' }, pend.map(({ reunion: r, acuerdo: a }) => {
        const cb = h('input', { type: 'checkbox', class: 'check', 'aria-label': `Marcar como hecho: ${a.texto}`,
          onchange: () => { row.classList.toggle('is-done', cb.checked); setTimeout(() => toggleAgreement(r.id, a.id, cb.checked), 350); } });
        const overdue = a.fecha && a.fecha < todayISO();
        const row = h('div', { class: 'tu-row tu-ag' }, cb,
          h('button', { type: 'button', class: 'tu-row-main tu-ag-main', onclick: () => openReunion({ groupId, reunionId: r.id }) },
            h('span', { class: 'tu-row-text' },
              h('span', { class: 'tu-row-title' }, a.texto),
              h('span', { class: 'tu-row-sub' }, `${reunionEventTitle(r, students)} · ${shortDate(r.fecha)}`)),
            a.fecha ? h('span', { class: 'tu-row-end' }, pill(`${overdue ? 'Venció el ' : 'Hasta el '}${shortDate(a.fecha)}`, overdue ? 't1' : 't5', 'clock')) : null));
        return row;
      })));
  }

  function paint() {
    const all = getReuniones(groupId);
    const students = byId(getStudents(groupId));
    const { proximas, sinCerrar, pasadas } = splitReuniones(all, todayISO());
    const pend = pendingAgreements(all);
    const parts = [
      section(`Sin cerrar · ${sinCerrar.length}`, sinCerrar.map((r) => row(r, students, { cerrar: true })), { alert: true }),
      section('Próximas', proximas.map((r) => row(r, students)), { empty: all.length ? 'No hay reuniones previstas.' : 'Todavía no hay reuniones. Crea la primera con «Nueva reunión».' }),
      agreementsCard(pend, students),
      section(`Realizadas${pasadas.length ? ` · ${pasadas.length}` : ''}`, pasadas.map((r) => row(r, students))),
    ].filter(Boolean);
    body.replaceChildren(...parts);
  }
  paint();
  const unsubs = ['reuniones', 'students'].map((c) => store.subscribe(c, paint));
  return () => unsubs.forEach((u) => u());
}
