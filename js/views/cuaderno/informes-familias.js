// Tabula · Cuaderno · Informes · Informes para familias (comentarios, banco de frases e impresión)
import { store } from '../../store.js';
import { h, icon, openSheet, toast } from '../../ui.js';
import { listName, fullName, initials, areaShort, areaColor } from '../../school.js';
import { toLevel, formatGrade } from '../../grading.js';
import { CLAVES, CLAVE_CORTA } from '../../competencias.js';
import { COMENTARIOS, fillComment, areaPhrase, senecaGrade } from '../../informes.js';
import { segmented, plural } from './common.js';
import { areaGrades, attendanceOf, getReport, saveReport } from './informes-data.js';
import { profileSetting, cursoLabel } from './informes-common.js';
import { reportPage, reportsDocument, printHTML } from './informes-print.js';
import { claveRows } from './informes-perfil.js';

const num = (n) => formatGrade(n, 'numerica');
const BANK = [['logros', 'Logros'], ['mejorar', 'A mejorar'], ['familia', 'Para casa']];
let bankTab = 'logros';

function reportFor(data, student, comentario) {
  const p = data.profiles[student.id];
  return {
    student, group: data.group, evLabel: data.evLabel, curso: cursoLabel(data.group), profile: profileSetting(),
    areas: areaGrades(data, student.id), claves: CLAVES.map((c) => ({ id: c.id, nota: p.claves[c.id].nota })),
    comentario, asistencia: attendanceOf(data.group, student.id), fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

export function mountFamilias(root, data, { onRepaint }) {
  const { students, group, ev } = data;
  if (!students.length) {
    root.append(h('div', { class: 'card' }, h('div', { class: 'empty cb-empty' }, icon('grupos', 40),
      h('strong', {}, 'Este grupo aún no tiene alumnado'), 'Añade alumnado para redactar los informes.')));
    return;
  }
  const comments = new Map(store.list('informes').filter((r) => r.groupId === group.id && r.ev === ev).map((r) => [r.studentId, r]));
  const done = students.filter((s) => comments.get(s.id)?.comentario).length;

  const printAll = () => {
    printHTML(reportsDocument(students.map((s) => reportPage(reportFor(data, s, comments.get(s.id)?.comentario || ''))), `Informes ${group.nombre}`));
  };

  const list = h('ul', { class: 'cb-fam-list' }, students.map((s) => {
    const c = comments.get(s.id)?.comentario;
    const grades = areaGrades(data, s.id).filter((a) => a.nota != null);
    return h('li', {}, h('button', { type: 'button', class: 'cb-fam-row', onclick: () => openReportSheet({ data, student: s, onSaved: onRepaint }) },
      h('span', { class: 'avatar cb-avatar' }, initials(s)),
      h('span', { class: 'cb-fam-main' }, h('span', { class: 'cb-student-name' }, listName(s)),
        h('small', {}, grades.length ? plural(grades.length, 'área evaluada', 'áreas evaluadas') : 'Sin notas todavía')),
      h('span', { class: `chip cb-fam-chip ${c ? 't3' : 't5'}` }, c ? icon('check', 13) : null, c ? 'Comentario escrito' : 'Pendiente'),
      icon('chevronRight', 16, 'cb-fam-go')));
  }));

  root.append(
    h('div', { class: 'cb-inf-row' },
      h('p', { class: 'cb-inf-explain' }, icon('star', 15), h('span', {}, 'Escribe un comentario para cada familia y genera un informe elegante, listo para imprimir o guardar como PDF.')),
      h('div', { class: 'cb-inf-tools' },
        h('span', { class: 'cb-fam-count', 'aria-live': 'polite' }, `${done} de ${students.length} con comentario`),
        h('button', { type: 'button', class: 'btn', onclick: printAll }, icon('printer', 16), 'Imprimir todos'))),
    h('div', { class: 'card cb-fam-card' }, list));
}

export function openReportSheet({ data, student, onSaved }) {
  const { group, ev } = data;
  const saved = getReport(group.id, student.id, ev);
  const grades = areaGrades(data, student.id);
  const p = data.profiles[student.id];
  const att = attendanceOf(group, student.id);

  const ta = h('textarea', { class: 'textarea cb-fam-text', id: 'cb-fam-text', rows: 7, maxlength: 1500, placeholder: 'Escribe el comentario para la familia o añade frases del banco…', 'aria-label': `Comentario para la familia de ${student.nombre}` });
  ta.value = saved?.comentario || '';
  const count = h('span', { class: 'cb-hint cb-fam-n' });
  const upd = () => { count.textContent = `${ta.value.length} / 1500`; };
  ta.addEventListener('input', upd); upd();

  const bankBody = h('div', { class: 'cb-bank-chips' });
  const paintBank = () => {
    bankBody.replaceChildren(...COMENTARIOS[bankTab].map((t) => {
      const text = fillComment(t, student.nombre);
      return h('button', { type: 'button', class: 'cb-bank-chip', title: 'Añadir al comentario', onclick: () => {
        const cur = ta.value;
        ta.value = (cur && !/\s$/.test(cur) ? cur + ' ' : cur) + text;
        upd(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      } }, icon('plus', 13), h('span', {}, text));
    }));
  };
  const bankSeg = segmented(BANK, bankTab, (v) => { bankTab = v; paintBank(); }, 'Banco de frases');
  bankSeg.classList.add('cb-bank-seg');
  paintBank();

  const areasBlock = grades.length ? h('div', { class: 'cb-fam-areas' }, grades.map((a) => {
    const g = senecaGrade(a.nota);
    return h('div', { class: 'cb-fam-area' },
      h('div', { class: 'cb-fam-area-top' },
        h('span', { class: `chip ${areaColor(a.area)}`, title: a.area }, areaShort(a.area)),
        a.nota == null ? h('span', { class: 'cb-muted' }, 'Sin evaluar')
          : h('span', { class: 'cb-fam-area-g' }, h('strong', {}, String(g.num)), h('span', { class: `chip cb-chip chip-${g.cal}` }, g.cal), h('small', {}, num(a.nota)))),
      a.nota == null ? null : h('div', { class: 'cb-fam-phrase' }, areaPhrase(a.nota)));
  })) : h('p', { class: 'cb-hint' }, 'Aún no hay cuadernos con notas en esta evaluación.');

  const claves = CLAVES.filter((c) => p.claves[c.id].nota != null);
  const clavesBlock = claves.length
    ? h('div', { class: 'cb-pf-list cb-pf-compact' }, claveRows({ claves: Object.fromEntries(claves.map((c) => [c.id, p.claves[c.id]])) }, { details: false }))
    : h('p', { class: 'cb-hint' }, 'Las competencias clave aparecerán cuando haya actividades vinculadas a criterios de evaluación.');

  const attBlock = att ? h('p', { class: 'cb-fam-att' }, icon('clock', 15),
    h('span', {}, `${plural(att.faltas + att.justificadas, 'falta', 'faltas')}${att.justificadas ? ` (${att.justificadas} justificadas)` : ''}, ${plural(att.retrasos, 'retraso', 'retrasos')} · asistencia ${att.pct} % en ${plural(att.dias, 'día registrado', 'días registrados')}`)) : null;

  const save = () => {
    saveReport(group.id, student.id, ev, ta.value);
    toast(ta.value.trim() ? 'Comentario guardado' : 'Comentario vacío: no se guarda');
    onSaved && onSaved();
    return true;
  };
  const print = () => {
    printHTML(reportsDocument([reportPage(reportFor(data, student, ta.value.trim()))], `Informe de ${fullName(student)}`));
  };

  const content = h('div', { class: 'cb-famsheet' },
    h('p', { class: 'cb-hint' }, `${data.evLabel} · ${group.nombre}`),
    h('h3', { class: 'section-label cb-sec cb-sec-first' }, 'Áreas'), areasBlock,
    h('h3', { class: 'section-label cb-sec' }, 'Competencias clave'), clavesBlock,
    attBlock ? [h('h3', { class: 'section-label cb-sec' }, 'Asistencia'), attBlock] : null,
    h('h3', { class: 'section-label cb-sec' }, h('label', { for: 'cb-fam-text' }, 'Comentario para la familia')),
    ta, h('div', { class: 'cb-fam-meta' }, count),
    h('div', { class: 'cb-bank' }, h('span', { class: 'field-label' }, 'Banco de frases'), bankSeg, bankBody),
    h('div', { class: 'cb-actions cb-fam-actions' },
      h('button', { type: 'button', class: 'btn', onclick: print }, icon('printer', 16), 'Imprimir informe'),
      h('span', { class: 'cb-spacer' }),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { save(); close(); } }, 'Guardar')));
  const close = openSheet(fullName(student), content);
  return close;
}
