// Tabula · Cuaderno · Informes · Perfil competencial (mapa de calor del grupo y detalle por alumno)
import { h, icon, openSheet } from '../../ui.js';
import { listName, fullName, initials } from '../../school.js';
import { toLevel, formatGrade, LEVEL_LABELS } from '../../grading.js';
import { CLAVES, CLAVE_CORTA, gradoAdquisicion } from '../../competencias.js';
import { areaShort } from '../../school.js';
import { segmented, plural } from './common.js';
import { groupProfileDocument, printHTML } from './informes-print.js';
import { cursoLabel, profileSetting } from './informes-common.js';

const num = (n) => formatGrade(n, 'numerica');
export const EXPLICACION = 'Se calcula a partir de las competencias específicas evaluadas en cada área y los descriptores que les asigna el BOJA.';
const DETALLE = 'Cada descriptor es la media de las competencias específicas que lo trabajan, y cada competencia clave, la media de sus descriptores.';

let cellMode = 'nivel'; // se recuerda mientras dure la sesión

/** Barra horizontal 0–10 coloreada por nivel. */
export function bar(nota, { small = false } = {}) {
  const lv = toLevel(nota);
  return h('div', { class: `cb-bar${small ? ' cb-bar-sm' : ''}${lv ? ` chip-${lv}` : ''}`, role: 'img', 'aria-label': nota == null ? 'Sin datos' : `${num(nota)} de 10` },
    h('i', { style: { width: nota == null ? '0%' : `${Math.max(2, Math.min(100, nota * 10))}%` } }));
}

function cellContent(nota, mode) {
  if (nota == null) return h('span', { class: 'cb-hm-empty' }, '·');
  return mode === 'nota' ? num(nota) : toLevel(nota);
}

export function mountPerfil(root, data, { onRepaint }) {
  const { students, profiles, means, group } = data;
  if (!students.length) {
    root.append(h('div', { class: 'card' }, h('div', { class: 'empty cb-empty' }, icon('grupos', 40),
      h('strong', {}, 'Este grupo aún no tiene alumnado'), 'Añade a tu alumnado para ver su perfil competencial.')));
    return;
  }
  if (!data.areas.length || !data.graded) {
    root.append(h('div', { class: 'card' }, h('div', { class: 'empty cb-empty' }, icon('cuaderno', 40),
      h('strong', {}, 'Todavía no hay datos para el perfil'),
      data.areas.length
        ? 'Vincula las actividades a los criterios de evaluación y anota notas: el perfil se calcula con las competencias específicas.'
        : 'Crea el cuaderno de un área con criterios de evaluación y anota notas para ver el perfil competencial.')));
    return;
  }

  const modeSeg = segmented([['nivel', 'Niveles'], ['nota', 'Notas']], cellMode, (v) => { cellMode = v; onRepaint(); }, 'Mostrar en la tabla');
  modeSeg.classList.add('cb-hm-mode');

  const cellTd = (nota, extra = '') => h('td', { class: `cb-hm-c ${extra}` },
    h('span', { class: `cb-hm-pill${nota == null ? ' is-empty' : ` chip-${toLevel(nota)}`}`, title: nota == null ? 'Sin datos' : `${num(nota)} · ${LEVEL_LABELS[toLevel(nota)]}` },
      cellContent(nota, cellMode)));

  const head = h('tr', {},
    h('th', { class: 'cb-hm-corner', scope: 'col' }, `Alumnado · ${students.length}`),
    CLAVES.map((c) => h('th', { scope: 'col', class: 'cb-hm-h', title: `${c.nombre}` }, h('abbr', { title: CLAVE_CORTA[c.id], 'aria-label': c.nombre }, c.id))),
    h('th', { scope: 'col', class: 'cb-hm-h cb-hm-g', title: 'Media de las competencias clave evaluadas' }, 'Global'));

  const rows = students.map((s) => {
    const p = profiles[s.id];
    return h('tr', {},
      h('th', { scope: 'row', class: 'cb-hm-name' },
        h('button', { type: 'button', class: 'cb-student cb-hm-stu', onclick: () => openProfileSheet({ data, student: s }) },
          h('span', { class: 'avatar cb-avatar' }, initials(s)), h('span', { class: 'cb-student-name' }, listName(s)))),
      CLAVES.map((c) => cellTd(p.claves[c.id].nota)),
      cellTd(p.global, 'cb-hm-g'));
  });
  const foot = h('tr', { class: 'cb-hm-mean' },
    h('th', { scope: 'row', class: 'cb-hm-name' }, h('span', { class: 'cb-hm-meanlbl' }, 'Media del grupo')),
    CLAVES.map((c) => cellTd(means[c.id])),
    cellTd(null, 'cb-hm-g'));

  const table = h('table', { class: 'cb-hm' }, h('caption', { class: 'sr-only' }, `Perfil competencial de ${group?.nombre || 'el grupo'}`),
    h('thead', {}, head), h('tbody', {}, rows), h('tfoot', {}, foot));

  const print = () => printHTML(groupProfileDocument({
    group, evLabel: data.evLabel, curso: cursoLabel(group), profile: profileSetting(), students, profiles, means, fullName: listName,
  }));

  root.append(
    h('div', { class: 'cb-inf-row' },
      h('p', { class: 'cb-inf-explain' }, icon('star', 15), h('span', {}, EXPLICACION)),
      h('div', { class: 'cb-inf-tools' }, modeSeg,
        h('button', { type: 'button', class: 'btn', onclick: print }, icon('printer', 16), 'Imprimir'))),
    h('div', { class: 'cb-hm-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tabla del perfil competencial' }, table),
    h('p', { class: 'cb-legend' }, CLAVES.map((c, i) => h('span', {}, h('b', {}, c.id), ` ${CLAVE_CORTA[c.id]}`, i < CLAVES.length - 1 ? ' · ' : ''))));
}

/** Ficha del perfil de un alumno: barra por competencia clave y descriptores desplegables. */
export function claveRows(profile, { details = true } = {}) {
  return CLAVES.filter((c) => profile.claves[c.id]).map((c) => {
    const cl = profile.claves[c.id];
    const grado = gradoAdquisicion(cl.nota);
    const head = h('div', { class: 'cb-pf-head' },
      h('span', { class: 'cb-pf-id' }, c.id),
      h('span', { class: 'cb-pf-name' }, CLAVE_CORTA[c.id]),
      h('span', { class: 'cb-pf-val' }, cl.nota == null ? h('span', { class: 'cb-muted' }, 'Sin datos') : [h('strong', {}, num(cl.nota)), h('span', { class: 'cb-pf-grado' }, grado)]));
    const body = [head, bar(cl.nota)];
    const ds = Object.entries(cl.descriptores);
    if (details && ds.length) {
      return h('details', { class: 'cb-pf' },
        h('summary', {}, h('div', { class: 'cb-pf-sum' }, head, bar(cl.nota)), icon('chevronDown', 16, 'cb-pf-chev')),
        h('div', { class: 'cb-pf-desc' }, ds.map(([id, d]) => h('div', { class: 'cb-pf-d' },
          h('div', { class: 'cb-pf-d-top' }, h('strong', {}, id), h('span', { class: 'cb-pf-d-n' }, num(d.nota), ' ', h('span', { class: `chip cb-chip chip-${d.nivel}` }, d.nivel))),
          h('div', { class: 'cb-pf-src' }, d.fuentes.map((f) => h('span', {}, `${areaShort(f.area)} · CE ${f.ce} · ${num(f.nota)}`)))))));
    }
    return h('div', { class: 'cb-pf cb-pf-flat' }, ...body);
  });
}

export function openProfileSheet({ data, student }) {
  const p = data.profiles[student.id];
  const content = h('div', { class: 'cb-pfsheet' },
    h('div', { class: 'cb-bk-top' },
      h('div', {}, h('div', { class: 'cb-bk-big' }, p.global == null ? '—' : num(p.global)),
        h('div', { class: 'cb-bk-meta' }, p.global == null ? 'Sin datos todavía' : `Media de ${plural(p.evaluadas, 'competencia clave', 'competencias clave')} · ${data.evLabel}`)),
      p.global == null ? null : h('span', { class: `chip cb-chip cb-chip-lg chip-${toLevel(p.global)}` }, gradoAdquisicion(p.global))),
    h('p', { class: 'cb-hint' }, `${EXPLICACION} ${DETALLE}`),
    h('h3', { class: 'section-label cb-sec' }, 'Competencias clave'),
    h('div', { class: 'cb-pf-list' }, claveRows(p)));
  return openSheet(fullName(student), content);
}
