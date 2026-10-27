// Tabula · Cuaderno · Informes · Séneca (resumen para pasar notas, CSV y copiado de columnas)
import { h, icon, toast } from '../../ui.js';
import { listName, areaShort, areaColor } from '../../school.js';
import { toCSV, senecaGrade, senecaSummaryRows, senecaCriteriaRows } from '../../informes.js';
import { toLevel } from '../../grading.js';
import { segmented, plural } from './common.js';
import { copyText, downloadText } from './informes-common.js';
import { groupSlug, evSlug } from './informes-data.js';

let escala = 'numerica';
let copyArea = null;

const slugArea = (a) => areaShort(a).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function mountSeneca(root, data) {
  const { students, areas, group, ev } = data;
  if (!areas.length || !students.length) {
    root.append(h('div', { class: 'card' }, h('div', { class: 'empty cb-empty' }, icon('download', 40),
      h('strong', {}, !students.length ? 'Este grupo aún no tiene alumnado' : 'Sin cuadernos todavía'),
      !students.length ? 'Añade alumnado para preparar las notas de Séneca.' : 'Crea el cuaderno de algún área y anota notas para preparar las calificaciones.')));
    return;
  }
  const base = `seneca-${groupSlug(group?.nombre)}-${evSlug(ev)}`;
  const rows = senecaSummaryRows(students, areas, { withLevel: true });
  const withGrades = areas.some((a) => students.some((s) => a.results[s.id]?.nota != null));

  // ---------- Vista previa ----------
  const head = h('tr', {},
    h('th', { scope: 'col', class: 'cb-sn-n' }, 'N.º'),
    h('th', { scope: 'col', class: 'cb-sn-name cb-hm-corner' }, 'Alumnado'),
    areas.map((a) => h('th', { scope: 'col', class: 'cb-sn-a', title: a.area }, h('span', { class: `chip ${areaColor(a.area)}` }, areaShort(a.area)))));
  const body = rows.slice(1).map((r, i) => h('tr', {},
    h('td', { class: 'cb-sn-n' }, r[0]),
    h('th', { scope: 'row', class: 'cb-sn-name cb-hm-name' }, listName(students[i])),
    areas.map((_, k) => {
      const n = r[2 + k * 2]; const cal = r[3 + k * 2];
      return h('td', { class: 'cb-sn-a' }, n ? h('span', { class: `cb-sn-g chip-${cal}` }, h('strong', {}, n), h('span', { class: 'cb-sn-l' }, cal)) : h('span', { class: 'cb-hm-empty' }, '·'));
    })));

  // ---------- Copiar columna ----------
  const withNames = areas.map((a) => a.area);
  if (!withNames.includes(copyArea)) copyArea = withNames[0];
  const sel = h('select', { class: 'select', id: 'cb-copy-area', 'aria-label': 'Área cuyas notas se copian', onchange: () => { copyArea = sel.value; } },
    areas.map((a) => h('option', { value: a.area, selected: a.area === copyArea }, a.area)));
  const doCopy = async () => {
    const a = areas.find((x) => x.area === sel.value);
    const lines = students.map((s) => { const g = senecaGrade(a.results[s.id]?.nota); return g ? String(g.num) : ''; });
    const ok = await copyText(lines.join('\n'));
    const n = lines.filter(Boolean).length;
    toast(ok ? `${plural(n, 'nota copiada', 'notas copiadas')} de ${areaShort(a.area)}` : 'No se pudo copiar. Prueba con la descarga en CSV');
  };

  // ---------- Descargas ----------
  const dlSummary = () => {
    downloadText(`${base}-resumen.csv`, toCSV(rows));
    toast('Resumen descargado');
  };
  const escalaSeg = segmented([['numerica', 'Numérica'], ['niveles', 'Niveles'], ['seneca', '1–5']], escala, (v) => { escala = v; }, 'Escala de los criterios');
  const critAreas = areas.filter((a) => (a.ctx.gb.criterios || []).length);
  const dlCrit = (a) => {
    const out = senecaCriteriaRows(students, a.ctx.gb.criterios, a.results, { escala });
    downloadText(`${base}-${slugArea(a.area)}-criterios.csv`, toCSV(out));
    toast(`Criterios de ${areaShort(a.area)} descargados`);
  };

  root.append(...[
    h('p', { class: 'cb-inf-explain' }, icon('star', 15), h('span', {}, 'Notas listas para pasar a Séneca: enteros del 1 al 10 y su calificación. Se redondea al entero más cercano sin cambiar de nivel (un 4,6 sigue siendo 4, Insuficiente).')),
    !withGrades ? h('div', { class: 'cb-warn', role: 'status' }, h('div', { class: 'cb-warn-text' }, h('p', {}, 'Todavía no hay notas calculadas en esta evaluación.'))) : null,
    h('div', { class: 'cb-hm-wrap', tabindex: '0', role: 'region', 'aria-label': 'Vista previa de las notas para Séneca' },
      h('table', { class: 'cb-hm cb-sn' }, h('caption', { class: 'sr-only' }, 'Notas por área'), h('thead', {}, head), h('tbody', {}, body))),
    h('div', { class: 'cb-sn-actions' },
      h('section', { class: 'card cb-sn-card' },
        h('h3', { class: 'cb-sn-t' }, 'Resumen del grupo'),
        h('p', { class: 'cb-hint' }, 'Una fila por alumno y una columna por área, con su calificación.'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: dlSummary }, icon('download', 16), 'Descargar resumen (.csv)')),
      h('section', { class: 'card cb-sn-card' },
        h('h3', { class: 'cb-sn-t' }, 'Copiar una columna'),
        h('p', { class: 'cb-hint' }, 'Las notas van una por línea, en el orden de la lista, para pegarlas en Séneca.'),
        h('div', { class: 'cb-sn-copy' }, sel, h('button', { type: 'button', class: 'btn', onclick: doCopy }, icon('note', 16), 'Copiar'))),
      h('section', { class: 'card cb-sn-card' },
        h('h3', { class: 'cb-sn-t' }, 'Criterios por área'),
        h('p', { class: 'cb-hint' }, critAreas.length ? 'Notas de cada criterio de evaluación, más la calificación del área.' : 'Ningún cuaderno tiene criterios de evaluación todavía.'),
        critAreas.length ? [h('div', { class: 'field cb-sn-esc' }, h('span', { class: 'field-label' }, 'Escala de los criterios'), escalaSeg),
          h('div', { class: 'cb-sn-crit' }, critAreas.map((a) => h('button', { type: 'button', class: 'btn btn-sm', onclick: () => dlCrit(a), 'aria-label': `Criterios de ${a.area} (.csv)` },
            icon('download', 14), `${areaShort(a.area)} · Criterios (.csv)`)))] : null))].filter(Boolean));
}
