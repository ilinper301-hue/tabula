// Tabula · Cuaderno · Informes · Sesión de evaluación (junta): resumen del grupo, áreas no superadas, medidas y acuerdos
import { store } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { fullName, listName, areaShort } from '../../school.js';
import { formatGrade, toLevel } from '../../grading.js';
import { juntaResumen } from '../../informes.js';
import { MEDIDAS } from '../../tutoria.js';
import { listObservations, evaluationRange } from '../../observations.js';
import { startYear } from '../anecdotario/common.js';
import { getMedidas } from '../tutoria/data.js';
import { attendanceOf } from './informes-data.js';
import { profileSetting, cursoLabel } from './informes-common.js';
import { juntaDocument, printHTML } from './informes-print.js';

const num = (n) => formatGrade(n, 'numerica');
const acuerdosKey = (groupId, ev) => `junta:${groupId}:${ev}`;

export function mountJunta(root, data) {
  const { students, group, ev } = data;
  if (!students.length) {
    root.append(h('div', { class: 'card' }, h('div', { class: 'empty cb-empty' }, icon('grupos', 40), h('strong', {}, 'Este grupo aún no tiene alumnado'))));
    return;
  }
  const areas = data.areas.map((a) => ({ area: a.area, notas: Object.fromEntries(students.map((s) => [s.id, a.results[s.id]?.nota ?? null])) }));
  const R = juntaResumen(students, areas);
  const faltas = Object.fromEntries(students.map((s) => { const a = attendanceOf(group, s.id); return [s.id, a ? a.faltas + a.justificadas : null]; }));
  const byId = Object.fromEntries(students.map((s) => [s.id, s]));
  const medidas = getMedidas(group.id).filter((m) => m.estado !== 'finalizada' && byId[m.studentId])
    .map((m) => ({ alumno: listName(byId[m.studentId]), texto: (MEDIDAS[m.tipo]?.label || 'Medida').replace(/ \(.*$/, '') }));
  const { from, to } = evaluationRange(ev, startYear(group));
  const tally = {};
  for (const o of listObservations({ groupId: group.id, from, to })) {
    const t = (tally[o.studentId] ||= { pos: 0, neg: 0 });
    if (o.tipo === 'positiva') t.pos++; else if (o.tipo === 'negativa') t.neg++;
  }
  const obs = students.filter((s) => tally[s.id]?.neg >= 2).map((s) => ({ alumno: listName(s), ...tally[s.id] }));

  const acuerdos = h('textarea', { class: 'textarea', id: 'cb-junta-acuerdos', rows: 4, maxlength: 3000, placeholder: 'Acuerdos de la sesión: refuerzos, comunicación a familias, propuestas…' });
  acuerdos.value = store.getSetting(acuerdosKey(group.id, ev), '') || '';
  let t = null;
  acuerdos.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => store.setSetting(acuerdosKey(group.id, ev), acuerdos.value), 600); });

  const print = () => {
    store.setSetting(acuerdosKey(group.id, ev), acuerdos.value);
    printHTML(juntaDocument({
      group, evLabel: data.evLabel, curso: cursoLabel(group), profile: profileSetting(), students, areas, resumen: R,
      faltas, medidas, obs, acuerdos: acuerdos.value, fullName,
    }));
  };
  if (!areas.length) toast('Aún no hay cuadernos con notas en esta evaluación');

  const chip = (n, label, cls) => h('div', { class: `cb-junta-stat ${cls}` }, h('strong', {}, String(n)), h('span', {}, label));
  const lv = (n) => (n == null ? h('span', { class: 'cb-muted' }, '·') : h('span', { class: `chip cb-chip chip-${toLevel(n)}` }, num(n)));
  const table = h('div', { class: 'cb-junta-wrap' }, h('table', { class: 'cb-junta-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Alumnado'), ...areas.map((a) => h('th', { title: a.area }, areaShort(a.area))), h('th', {}, 'No sup.'), h('th', {}, 'Faltas'))),
    h('tbody', {}, ...students.map((s) => h('tr', {},
      h('td', {}, listName(s)), ...areas.map((a) => h('td', {}, lv(a.notas[s.id]))),
      h('td', {}, String(R.porAlumno[s.id].suspensas.length || '')), h('td', {}, faltas[s.id] == null ? '' : String(faltas[s.id]))))),
    h('tfoot', {}, h('tr', {}, h('td', {}, 'Media'), ...R.porArea.map((a) => h('td', {}, lv(a.media))), h('td', {}), h('td', {})),
      h('tr', {}, h('td', {}, 'Aprobados'), ...R.porArea.map((a) => h('td', {}, a.pct == null ? '·' : `${a.pct} %`)), h('td', {}), h('td', {})))));

  const pend = students.filter((s) => R.porAlumno[s.id].suspensas.length);
  root.append(
    h('div', { class: 'cb-inf-row' },
      h('p', { class: 'cb-inf-explain' }, icon('table', 15), h('span', {}, 'Todo lo que se repasa en la sesión de evaluación, en una hoja lista para imprimir.')),
      h('div', { class: 'cb-inf-tools' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'cb-junta-imprimir', onclick: print }, icon('printer', 16), 'Imprimir acta'))),
    h('div', { class: 'cb-junta-stats' },
      chip(R.mediaGrupo == null ? '—' : num(R.mediaGrupo), 'media del grupo', ''),
      chip(R.reparto.todo, 'todo superado', 'ok'), chip(R.reparto.una, 'una no superada', ''),
      chip(R.reparto.dos, 'dos no superadas', ''), chip(R.reparto.tresOmas, 'tres o más', R.reparto.tresOmas ? 'warn' : '')),
    h('div', { class: 'card cb-junta-card' }, areas.length ? table : h('p', { class: 'cb-hint' }, 'Aún no hay cuadernos con notas en esta evaluación.')),
    pend.length ? h('div', { class: 'card cb-junta-card' }, h('h3', { class: 'section-label' }, 'Áreas no superadas'),
      h('ul', { class: 'cb-junta-list' }, ...pend.map((s) => h('li', {}, h('strong', {}, listName(s)), ': ', R.porAlumno[s.id].suspensas.map(areaShort).join(', '))))) : '',
    medidas.length ? h('div', { class: 'card cb-junta-card' }, h('h3', { class: 'section-label' }, 'Medidas de atención a la diversidad'),
      h('ul', { class: 'cb-junta-list' }, ...medidas.map((m) => h('li', {}, h('strong', {}, m.alumno), ': ', m.texto)))) : '',
    obs.length ? h('div', { class: 'card cb-junta-card' }, h('h3', { class: 'section-label' }, 'Observaciones a mejorar repetidas'),
      h('ul', { class: 'cb-junta-list' }, ...obs.map((o) => h('li', {}, h('strong', {}, o.alumno), `: ${o.neg} a mejorar, ${o.pos} positivas`)))) : '',
    h('div', { class: 'card cb-junta-card' }, h('h3', { class: 'section-label' }, h('label', { for: 'cb-junta-acuerdos' }, 'Acuerdos')), acuerdos));
}
