// Tabula · Tutoría · pestaña «Diversidad» (medidas de atención a la diversidad del grupo)
import { store } from '../../store.js';
import { h, icon, todayISO, tagClass } from '../../ui.js';
import { getGroup, getStudents } from '../../school.js';
import { MEDIDAS, measuresSummary, reviewsDue } from '../../tutoria.js';
import { plural, listName, initials, shortDate, pill, privacyNote } from './common.js';
import { getMedidas } from './data.js';
import { openMedida } from './medida-sheet.js';

export function mountDiversidad(panel, { groupId }) {
  let verFinalizadas = false;
  const summary = h('div', { class: 'tu-summary' });
  const list = h('div', { class: 'tu-stack' });
  const toggle = h('label', { class: 'tu-check-inline' },
    h('input', { type: 'checkbox', onchange: (e) => { verFinalizadas = e.target.checked; paint(); } }), 'Mostrar finalizadas');
  panel.replaceChildren(
    h('div', { class: 'tu-toolbar' },
      h('p', { class: 'tu-lead' }, 'Apoyos, refuerzos y adaptaciones del alumnado del grupo.'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openMedida({ groupId }) }, icon('plus', 16), 'Nueva medida')),
    summary, list, h('div', { class: 'tu-foot' }, toggle, privacyNote()));

  function medidaRow(m) {
    const due = reviewsDue([m], todayISO())[0];
    const overdue = due && m.revision < todayISO();
    const meta = [m.profesional, m.horario].filter(Boolean).join(' · ');
    return h('button', { type: 'button', class: `tu-row-main tu-medida${m.estado !== 'activa' ? ' is-off' : ''}`, onclick: () => openMedida({ groupId, medidaId: m.id }) },
      h('span', { class: 'tu-row-text' },
        h('span', { class: 'tu-row-title' }, (MEDIDAS[m.tipo] || {}).label || m.tipo),
        meta ? h('span', { class: 'tu-row-sub' }, meta) : null,
        m.detalle ? h('span', { class: 'tu-row-sub tu-clamp' }, m.detalle) : null),
      h('span', { class: 'tu-row-end' },
        m.estado !== 'activa' ? pill('Finalizada', 't5') : null,
        m.estado === 'activa' && m.revision
          ? (due ? pill(overdue ? `Revisión vencida · ${shortDate(m.revision)}` : `Revisar el ${shortDate(m.revision)}`, 't1', 'flag')
            : pill(`Revisión ${shortDate(m.revision)}`, 't2', 'clock'))
          : null));
  }

  function paint() {
    const group = getGroup(groupId);
    const students = getStudents(groupId);
    const all = getMedidas(groupId);
    const sum = measuresSummary(all);
    const dues = reviewsDue(all, todayISO());
    const color = group && /^t[1-6]$/.test(group.color) ? group.color : 't1';

    summary.replaceChildren(
      sum.length
        ? h('div', { class: 'tu-chips', role: 'list', 'aria-label': 'Alumnado con cada medida' }, sum.map((x) => h('span', { class: `chip ${tagClass(x.tipo)} tu-chip-big`, role: 'listitem' },
          x.label.replace(/\s*\(.*\)$/, ''), h('b', {}, String(x.alumnos)))))
        : '',
      dues.length ? h('p', { class: 'tu-alert' }, icon('flag', 16), `${plural(dues.length, 'revisión próxima o vencida', 'revisiones próximas o vencidas')}.`) : '');

    const bySt = students.map((s) => ({ s, ms: all.filter((m) => m.studentId === s.id && (verFinalizadas || m.estado === 'activa')) })).filter((x) => x.ms.length);
    if (!bySt.length) {
      list.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'empty' }, icon('flag', 40),
        h('strong', {}, all.length ? 'No hay medidas activas' : 'Aún no hay medidas registradas'),
        'Registra apoyos, refuerzos o adaptaciones con «Nueva medida».')));
      return;
    }
    list.replaceChildren(...bySt.map(({ s, ms }) => h('section', { class: 'card tu-pupil' },
      h('div', { class: 'tu-pupil-head' },
        h('span', { class: `gr-avatar gr-c-${color}`, 'aria-hidden': 'true' }, initials(s)),
        h('strong', {}, listName(s)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openMedida({ groupId, defaults: { studentId: s.id } }), 'aria-label': `Añadir medida a ${listName(s)}` }, icon('plus', 14), 'Medida')),
      h('div', { class: 'tu-list tu-list-flat' }, ms.map(medidaRow)))));
  }
  paint();
  const unsubs = ['medidas', 'students'].map((c) => store.subscribe(c, paint));
  return () => unsubs.forEach((u) => u());
}
