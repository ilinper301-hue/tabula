// Tabula · Cuaderno · traer notas de Calculi (cálculo mental)
// Lee el resumen que Calculi deja en este navegador (mismo dominio) y crea o actualiza columnas del cuaderno.
import { store } from '../../store.js';
import { h, icon, toast, todayISO, openSheet } from '../../ui.js';
import { EVALUACIONES } from '../../grading.js';
import { readCalculi, matchCalculi, trucosConDatos, planCalculi, CALCULI_URL } from '../../calculi.js';
import { getStudents, listName } from '../../school.js';
import { currentEv, cursoOf } from './model.js';
import { field, segmented, trunc, plural } from './common.js';

/**
 * @param gb     cuaderno del grupo y área
 * @param group  grupo de Tabula
 * @param ev     evaluación seleccionada ('1'|'2'|'3'|'final')
 */
export function openCalculiSheet({ gb, group, ev }) {
  const data = readCalculi();
  if (!data || !data.alumnos.length) {
    const close = openSheet('Traer de Calculi', h('div', { class: 'cb-form' },
      h('p', {}, 'No hay datos de Calculi en este navegador.'),
      h('p', { class: 'cb-hint' }, 'Calculi guarda un resumen del progreso de cada alumno en el dispositivo donde se usa. Abre Calculi en este mismo navegador (al menos una vez después de practicar) y vuelve aquí.'),
      h('div', { class: 'cb-actions' }, h('span', { class: 'cb-spacer' }),
        h('a', { class: 'btn', href: CALCULI_URL, target: '_blank', rel: 'noopener' }, icon('external', 16), 'Abrir Calculi'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => close() }, 'Entendido'))));
    return close;
  }

  const students = getStudents(group.id);
  const curso = cursoOf(group.id) || null;
  const f = {
    mapa: matchCalculi(students, data.alumnos),
    curso: curso && data.alumnos.some((a) => a.trucos.some((t) => t.curso === curso)) ? curso : null,
    modo: 'truco', sel: null,
    evaluacion: String(ev === 'final' ? currentEv() : ev),
    instrumentoId: '', criterioIds: new Set(),
  };

  const error = h('p', { class: 'cb-error', role: 'alert', hidden: true });
  const showError = (m) => { error.textContent = m; error.hidden = false; error.scrollIntoView({ block: 'nearest' }); };
  const fecha = new Date(data.ts || Date.now());

  // ---- Emparejamiento de alumnos
  const matchBox = h('div', { class: 'cb-calc-match' });
  const optsCalc = [...data.alumnos].sort((x, y) => x.n.localeCompare(y.n, 'es'));
  function paintMatch() {
    const n = students.filter((s) => f.mapa[s.id]).length;
    matchBox.replaceChildren(
      h('p', { class: 'cb-hint' }, `${plural(n, 'alumno emparejado', 'alumnos emparejados')} de ${students.length}. Revisa los que no coinciden: Calculi suele guardar solo el nombre.`),
      ...students.map((s) => h('label', { class: 'cb-calc-row' },
        h('span', { class: 'cb-calc-name' }, listName(s)),
        h('select', { class: 'select', 'aria-label': `Alumno de Calculi para ${listName(s)}`, onchange: (e) => { if (e.target.value) f.mapa[s.id] = e.target.value; else delete f.mapa[s.id]; paintTrucos(); paintMatchCount(); } },
          h('option', { value: '' }, '— Sin datos —'),
          optsCalc.map((a) => h('option', { value: a.id, selected: f.mapa[s.id] === a.id }, `${a.n}${a.curso ? ` (${a.curso}.º)` : ''}`))))));
  }
  const paintMatchCount = () => { const p = matchBox.querySelector('.cb-hint'); if (p) p.textContent = `${plural(students.filter((s) => f.mapa[s.id]).length, 'alumno emparejado', 'alumnos emparejados')} de ${students.length}. Revisa los que no coinciden: Calculi suele guardar solo el nombre.`; };

  // ---- Trucos
  const trucoBox = h('div', { class: 'cb-calc-trucos' });
  function paintTrucos() {
    const ids = new Set(Object.values(f.mapa));
    const lista = trucosConDatos(data.alumnos, ids, f.curso);
    if (!f.sel) f.sel = new Set(lista.filter((t) => t.conDatos).map((t) => t.id));
    trucoBox.replaceChildren(...(lista.length ? lista.map((t) => {
      const b = h('button', {
        type: 'button', class: 'cb-crit-chip', 'aria-pressed': String(f.sel.has(t.id)), title: t.nombre,
        onclick: () => { if (f.sel.has(t.id)) f.sel.delete(t.id); else f.sel.add(t.id); b.setAttribute('aria-pressed', String(f.sel.has(t.id))); },
      }, h('strong', {}, `${t.trimestre}.º T`), h('span', {}, `${trunc(t.nombre, 34)} · ${t.conDatos} con datos`));
      return b;
    }) : [h('p', { class: 'cb-hint' }, 'Los alumnos emparejados aún no tienen trucos con datos en este curso.')]));
  }
  const cursos = [...new Set(data.alumnos.flatMap((a) => a.trucos.map((t) => t.curso)))].filter(Boolean).sort();
  const cursoSeg = segmented([['', 'Todos'], ...cursos.map((c) => [String(c), `${c}.º`])], f.curso ? String(f.curso) : '', (v) => { f.curso = v ? Number(v) : null; f.sel = null; paintTrucos(); }, 'Curso de los trucos');

  // ---- Columna(s), evaluación, instrumento y criterios
  const modoSeg = segmented([['truco', 'Una columna por truco'], ['media', 'Una columna con la media']], f.modo, (v) => { f.modo = v; }, 'Cómo añadir las notas');
  const evSel = h('select', { class: 'select', onchange: (e) => { f.evaluacion = e.target.value; } }, EVALUACIONES.filter((e) => e.id !== 'final').map((e) => h('option', { value: e.id, selected: e.id === f.evaluacion }, e.label)));
  const insSel = h('select', { class: 'select', onchange: (e) => { f.instrumentoId = e.target.value; } },
    h('option', { value: '' }, gb.modo === 'porcentajes' ? 'Elige un instrumento…' : 'Sin instrumento'),
    (gb.instrumentos || []).map((i) => h('option', { value: i.id }, `${i.nombre} (${i.peso} %)`)));
  const critBox = h('div', { class: 'cb-crit-pick', role: 'group', 'aria-label': 'Criterios de evaluación' },
    (gb.criterios || []).length ? (gb.criterios || []).map((cr) => {
      const b = h('button', { type: 'button', class: 'cb-crit-chip', 'aria-pressed': 'false', title: `${cr.codigo} ${cr.descripcion || ''}`.trim(),
        onclick: () => { if (f.criterioIds.has(cr.id)) f.criterioIds.delete(cr.id); else f.criterioIds.add(cr.id); b.setAttribute('aria-pressed', String(f.criterioIds.has(cr.id))); } },
      h('strong', {}, cr.codigo || '·'), cr.descripcion ? h('span', {}, trunc(cr.descripcion, 46)) : null);
      return b;
    }) : h('p', { class: 'cb-hint' }, 'Aún no hay criterios. Añádelos en «Configurar».'));

  function submit(e) {
    e.preventDefault();
    if (!Object.keys(f.mapa).length) return showError('Empareja al menos un alumno con su nombre en Calculi.');
    if (!f.sel || !f.sel.size) return showError('Elige al menos un truco.');
    if (gb.modo === 'porcentajes' && !f.instrumentoId) return showError('Elige el instrumento de evaluación: sin él las notas no cuentan.');
    if (gb.modo === 'criterios' && !f.criterioIds.size) return showError((gb.criterios || []).length ? 'Elige al menos un criterio de evaluación.' : 'Primero añade los criterios del área en «Configurar».');
    const cols = planCalculi({ alumnos: data.alumnos, mapa: f.mapa, trucos: [...f.sel], modo: f.modo }).filter((c) => Object.keys(c.notas).length);
    if (!cols.length) return showError('Los alumnos emparejados aún no tienen datos suficientes en esos trucos (hacen falta 5 intentos por truco).');
    const evN = Number(f.evaluacion), existentes = store.list('activities').filter((a) => a.gradebookId === gb.id && a.origen === 'calculi' && a.evaluacion === evN);
    let nuevas = 0, actualizadas = 0;
    for (const c of cols) {
      const datos = { nombre: c.nombre, fecha: todayISO(), evaluacion: evN, tipo: 'nota', instrumentoId: f.instrumentoId || null,
        criterioIds: (gb.criterios || []).map((x) => x.id).filter((id) => f.criterioIds.has(id)), peso: 1, rubrica: null, origen: 'calculi', claveCalculi: c.clave };
      const prev = existentes.find((a) => a.claveCalculi === c.clave);
      const act = prev ? store.update('activities', prev.id, datos) : store.add('activities', { gradebookId: gb.id, ...datos });
      prev ? actualizadas++ : nuevas++;
      const doc = store.list('grades').find((g) => g.activityId === act.id);
      const notas = { ...(doc?.notas || {}) };
      for (const [sid, n] of Object.entries(c.notas)) notas[sid] = { ...(notas[sid] || {}), v: n.v, c: n.c };
      if (doc) store.update('grades', doc.id, { notas }); else store.add('grades', { activityId: act.id, notas });
    }
    close();
    toast([nuevas ? plural(nuevas, 'columna nueva', 'columnas nuevas') : '', actualizadas ? plural(actualizadas, 'columna actualizada', 'columnas actualizadas') : ''].filter(Boolean).join(' y ') + ' desde Calculi');
  }

  paintMatch(); paintTrucos();
  const form = h('form', { class: 'cb-form', onsubmit: submit, novalidate: true },
    h('p', { class: 'cb-hint' }, `Datos de Calculi del ${fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} a las ${fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}. La nota es el porcentaje de aciertos sin ayuda en los 10 últimos intentos de cada truco (90 % → 9).`),
    h('details', { class: 'cb-details', open: Object.keys(f.mapa).length < students.length }, h('summary', {}, 'Alumnos'), matchBox),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Curso de los trucos'), cursoSeg),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Trucos'), trucoBox),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Cómo añadir las notas'), modoSeg),
    h('div', { class: 'cb-two' }, field('Evaluación', evSel), field(gb.modo === 'porcentajes' ? 'Instrumento (obligatorio)' : 'Instrumento (opcional)', insSel)),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, gb.modo === 'criterios' ? 'Criterios de evaluación (obligatorio)' : 'Criterios de evaluación (opcional)'), critBox),
    h('p', { class: 'cb-hint' }, 'Si vuelves a traer los mismos trucos en la misma evaluación, se actualizan las columnas en lugar de duplicarlas.'),
    error,
    h('div', { class: 'cb-actions' }, h('span', { class: 'cb-spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, icon('upload', 16), 'Añadir al cuaderno')));
  const close = openSheet('Traer de Calculi', form);
  return close;
}
