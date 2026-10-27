// Tabula · Tutoría · ficha de tutoría de un alumno (contacto, reuniones, medidas y accesos rápidos)
import { store } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { getGroup, fullName, initials } from '../../school.js';
import { studentFile, TIPOS_REUNION, MEDIDAS, ESTADOS_REUNION } from '../../tutoria.js';
import { pill, plural, mediumDate, wideSheet, privacyNote, sheet } from './common.js';
import { getReuniones, getMedidas } from './data.js';
import { openReunion } from './reunion-sheet.js';
import { openMedida } from './medida-sheet.js';

const PHONE_RE = /\+?\d[\d\s.-]{7,}\d/;

export function openFichaTutoria(studentId) {
  const s = store.get('students', studentId);
  if (!s) { toast('No se encuentra ese alumno'); return null; }
  const group = getGroup(s.groupId);
  const color = group && /^t[1-6]$/.test(group.color) ? group.color : 't1';
  const body = h('div', { class: 'tu-ficha' });
  let closeSheet;
  const then = (fn) => () => { closeSheet(); fn(); };

  function paint() {
    const st = store.get('students', studentId);
    if (!st) { closeSheet(); return; }
    const file = studentFile(studentId, getReuniones(st.groupId), getMedidas(st.groupId));
    const activas = file.medidas.filter((m) => m.estado === 'activa');
    const tel = (st.contacto || '').match(PHONE_RE);

    const contacto = h('div', { class: 'tu-contact' },
      h('div', { class: 'section-label' }, 'Contacto de la familia'),
      st.contacto
        ? h('p', { class: 'tu-contact-text' }, st.contacto, tel ? h('a', { class: 'btn btn-sm', href: `tel:${tel[0].replace(/[^\d+]/g, '')}` }, 'Llamar') : null)
        : h('p', { class: 'tu-hint' }, 'Todavía no hay datos de contacto.'),
      h('a', { class: 'link-btn', href: `#/grupos?id=${encodeURIComponent(st.groupId)}`, onclick: () => closeSheet() }, 'Editar en la ficha del alumno'));

    const reuniones = file.reuniones.length
      ? h('div', { class: 'tu-list tu-list-flat' }, file.reuniones.map((r) => {
        const pend = (r.acuerdos || []).filter((a) => !a.hecho).length;
        return h('button', { type: 'button', class: 'tu-row-main tu-mini', onclick: then(() => openReunion({ groupId: st.groupId, reunionId: r.id })) },
          h('span', { class: 'tu-mini-date' }, mediumDate(r.fecha)),
          h('span', { class: 'tu-row-text' },
            h('span', { class: 'tu-row-title' }, TIPOS_REUNION[r.tipo] || 'Reunión'),
            r.motivo || r.resumen ? h('span', { class: 'tu-row-sub tu-clamp' }, r.resumen || r.motivo) : null),
          h('span', { class: 'tu-row-end' },
            r.estado !== 'realizada' ? pill(ESTADOS_REUNION[r.estado], r.estado === 'prevista' ? 't2' : 't5') : null,
            r.estado === 'realizada' && pend ? pill(plural(pend, 'acuerdo pendiente', 'acuerdos pendientes'), 't1') : null));
      }))
      : h('p', { class: 'tu-hint' }, 'Todavía no hay reuniones con esta familia.');

    const medidas = activas.length
      ? h('div', { class: 'tu-list tu-list-flat' }, activas.map((m) => h('button', { type: 'button', class: 'tu-row-main tu-mini', onclick: then(() => openMedida({ groupId: st.groupId, medidaId: m.id })) },
        h('span', { class: 'tu-row-text' },
          h('span', { class: 'tu-row-title' }, (MEDIDAS[m.tipo] || {}).label || m.tipo),
          m.profesional || m.horario ? h('span', { class: 'tu-row-sub' }, [m.profesional, m.horario].filter(Boolean).join(' · ')) : null),
        icon('chevronRight', 16, 'tu-chev'))))
      : h('p', { class: 'tu-hint' }, 'Sin medidas activas.');

    body.replaceChildren(
      h('div', { class: 'tu-ficha-head' },
        h('span', { class: `gr-avatar gr-c-${color}`, 'aria-hidden': 'true' }, initials(st)),
        h('div', {}, h('strong', { class: 'tu-ficha-name' }, fullName(st)), h('div', { class: 'tu-hint' }, group ? group.nombre : ''))),
      h('div', { class: 'tu-ficha-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: then(() => openReunion({ groupId: st.groupId, defaults: { tipo: 'familia', studentIds: [st.id] } })) }, icon('plus', 16), 'Citar a la familia'),
        h('button', { type: 'button', class: 'btn', onclick: then(() => openMedida({ groupId: st.groupId, defaults: { studentId: st.id } })) }, icon('plus', 16), 'Nueva medida')),
      contacto,
      h('section', {}, h('h3', { class: 'section-label' }, `Reuniones · ${file.reuniones.length}`), reuniones),
      h('section', {}, h('h3', { class: 'section-label' }, `Medidas activas · ${activas.length}`), medidas),
      privacyNote());
  }
  paint();
  closeSheet = sheet('Ficha de tutoría', body);
  wideSheet(body, 540);
  return closeSheet;
}
