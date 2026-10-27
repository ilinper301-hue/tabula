// Tabula · Cuaderno · hoja «Configurar» del cuaderno de un área
import { store, uid } from '../../store.js';
import { h, icon, toast, openSheet } from '../../ui.js';
import { LEVELS, LEVEL_LABELS, configWarnings, parseCriteriaList, round1 } from '../../grading.js';
import { removeGradebook, restoreGradebook } from './model.js';
import { field, segmented, confirmDelete, plural, trunc } from './common.js';
import { areaShort } from '../../school.js';

const toNum = (v, fb = 0) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : fb; };

export function openConfigSheet({ gb, activities }) {
  // Borrador: no se guarda nada hasta pulsar «Guardar».
  const D = JSON.parse(JSON.stringify({
    escala: gb.escala, modo: gb.modo, final: gb.final,
    instrumentos: gb.instrumentos || [], criterios: gb.criterios || [], niveles: gb.niveles || {},
  }));

  // ---- Avisos en vivo
  const warnBox = h('div', { class: 'cb-warn cb-warn-sheet', role: 'status', hidden: true });
  const paintWarnings = () => {
    const w = configWarnings({ ...gb, ...D }, activities);
    warnBox.hidden = !w.length;
    warnBox.replaceChildren(...w.map((t) => h('p', {}, t)));
  };

  // ---- Escala, modo, nota final
  const escalaSeg = segmented([['niveles', 'Niveles'], ['numerica', 'Notas numéricas']], D.escala, (v) => { D.escala = v; }, 'Escala');
  const modoSeg = segmented([['porcentajes', 'Por porcentajes de instrumentos'], ['criterios', 'Por criterios de evaluación (Séneca)']], D.modo, (v) => { D.modo = v; paintWarnings(); }, 'Modo de cálculo');
  modoSeg.classList.add('cb-seg-col');
  const finalSeg = segmented([['continua', 'Evaluación continua: todas las actividades'], ['media', 'Media de las tres evaluaciones']], D.final, (v) => { D.final = v; }, 'Nota final');

  finalSeg.classList.add('cb-seg-col');

  // ---- Instrumentos
  const total = h('div', { class: 'cb-total' });
  const insList = h('div', { class: 'cb-rows' });
  function paintTotal() {
    const t = D.instrumentos.reduce((s, i) => s + (Number(i.peso) || 0), 0);
    const ok = Math.round(t) === 100;
    total.className = `cb-total${ok ? ' ok' : ' bad'}`;
    total.replaceChildren(icon(ok ? 'check' : 'flag', 15), h('span', {}, ok ? 'Suma 100 %' : `Suman ${round1(t)} % (deberían sumar 100 %)`));
    paintWarnings();
  }
  function paintInstrumentos() {
    insList.replaceChildren(...D.instrumentos.map((ins, i) => {
      const n = h('input', { class: 'input', type: 'text', value: ins.nombre, maxlength: 40, 'aria-label': `Nombre del instrumento ${i + 1}`, oninput: () => { ins.nombre = n.value; } });
      const p = h('input', { class: 'input cb-w-num', type: 'number', inputmode: 'decimal', min: '0', max: '100', step: '5', value: String(ins.peso ?? 0), 'aria-label': `Porcentaje de ${ins.nombre || 'instrumento ' + (i + 1)}`, oninput: () => { ins.peso = toNum(p.value); paintTotal(); } });
      return h('div', { class: 'cb-row' }, n, p, h('span', { class: 'cb-unit' }, '%'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Quitar ${ins.nombre || 'instrumento'}`, onclick: () => { D.instrumentos.splice(i, 1); paintInstrumentos(); } }, icon('x', 18)));
    }));
    paintTotal();
  }
  paintInstrumentos();

  // ---- Criterios
  const critList = h('div', { class: 'cb-rows' });
  function paintCriterios() {
    critList.replaceChildren(...(D.criterios.length ? D.criterios.map((cr, i) => {
      const c = h('input', { class: 'input cb-w-code', type: 'text', value: cr.codigo, maxlength: 14, placeholder: '1.1', 'aria-label': `Código del criterio ${i + 1}`, oninput: () => { cr.codigo = c.value.trim(); } });
      const d = h('textarea', { class: 'textarea cb-desc', rows: 2, maxlength: 600, 'aria-label': `Descripción del criterio ${i + 1}`, placeholder: 'Descripción', oninput: () => { cr.descripcion = d.value; } });
      d.value = cr.descripcion || '';
      const p = h('input', { class: 'input cb-w-num', type: 'number', inputmode: 'decimal', min: '0', step: '0.5', value: String(cr.peso ?? 1), title: 'Peso', 'aria-label': `Peso del criterio ${i + 1}`, oninput: () => { cr.peso = toNum(p.value, 1); } });
      return h('div', { class: 'cb-row cb-row-crit' }, c, d, p,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Quitar criterio ${cr.codigo || i + 1}`, onclick: () => { D.criterios.splice(i, 1); paintCriterios(); paintWarnings(); } }, icon('x', 18)));
    }) : [h('p', { class: 'cb-hint' }, 'Sin criterios. Pega la lista del área o añádelos uno a uno.')]));
  }
  paintCriterios();

  // Pegar criterios con vista previa
  const paste = h('textarea', { class: 'textarea', rows: 5, spellcheck: 'false', placeholder: 'Una línea por criterio:\n1.1. Comprender textos orales…\n1.2. Interpretar el sentido global…', 'aria-label': 'Criterios para pegar' });
  const preview = h('div', { class: 'cb-preview' });
  const addPasted = h('button', { type: 'button', class: 'btn btn-sm btn-primary', disabled: true }, 'Añadir criterios');
  let parsed = [];
  paste.addEventListener('input', () => {
    parsed = parseCriteriaList(paste.value);
    const sinCodigo = parsed.filter((p) => !p.codigo).length;
    addPasted.disabled = !parsed.length;
    addPasted.textContent = parsed.length ? `Añadir ${plural(parsed.length, 'criterio', 'criterios')}` : 'Añadir criterios';
    preview.replaceChildren(...[...parsed.slice(0, 40).map((p) => h('div', { class: 'cb-prev-row' },
      p.codigo ? h('strong', {}, p.codigo) : h('span', { class: 'chip cb-lv-in' }, 'sin código'), h('span', {}, trunc(p.descripcion, 90)))),
    sinCodigo ? h('p', { class: 'cb-hint' }, `${plural(sinCodigo, 'línea no tiene', 'líneas no tienen')} código reconocible; podrás escribirlo después.`) : null].filter(Boolean));
  });
  addPasted.addEventListener('click', () => {
    parsed.forEach((p) => D.criterios.push({ id: uid(), codigo: p.codigo, descripcion: p.descripcion, peso: 1 }));
    toast(`${plural(parsed.length, 'criterio añadido', 'criterios añadidos')}`);
    paste.value = ''; parsed = []; preview.replaceChildren(); addPasted.disabled = true; addPasted.textContent = 'Añadir criterios';
    paintCriterios(); paintWarnings();
  });
  const pasteDet = h('details', { class: 'cb-details' }, h('summary', {}, 'Pegar criterios'),
    h('div', { class: 'cb-details-body' }, paste, preview, addPasted));

  // ---- Valor de cada nivel
  const levelInputs = h('div', { class: 'cb-lv-grid' }, LEVELS.map((code) => {
    const inp = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: '0', max: '10', step: '0.5', value: String(D.niveles[code] ?? ''), 'aria-label': `Valor de ${code}`, oninput: () => { D.niveles[code] = Math.min(10, Math.max(0, toNum(inp.value))); } });
    return h('label', { class: 'cb-lv-field', title: LEVEL_LABELS[code] }, h('span', {}, code), inp);
  }));

  // ---- Guardar
  function submit(e) {
    e.preventDefault();
    const instrumentos = D.instrumentos.filter((i) => (i.nombre || '').trim()).map((i) => ({ id: i.id, nombre: i.nombre.trim(), peso: Number(i.peso) || 0 }));
    const criterios = D.criterios.filter((c) => (c.codigo || '').trim() || (c.descripcion || '').trim())
      .map((c) => ({ id: c.id, codigo: (c.codigo || '').trim(), descripcion: (c.descripcion || '').trim(), peso: c.peso > 0 ? c.peso : 1 }));
    store.update('gradebooks', gb.id, { escala: D.escala, modo: D.modo, final: D.final, instrumentos, criterios, niveles: D.niveles });
    close();
    toast('Configuración guardada');
  }

  const del = confirmDelete({
    label: 'Eliminar cuaderno', yes: 'Sí, eliminar el cuaderno',
    question: `Se eliminará el cuaderno de ${areaShort(gb.area)} con sus ${plural(activities.length, 'actividad', 'actividades')} y todas las notas.`,
    onYes: () => {
      const undo = removeGradebook(gb.id);
      close();
      toast('Cuaderno eliminado', { label: 'Deshacer', run: () => restoreGradebook(undo) });
    },
  });

  const form = h('form', { class: 'cb-form', onsubmit: submit, novalidate: true },
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Escala'), escalaSeg,
      h('span', { class: 'cb-hint' }, 'Las notas se guardan de 0 a 10; la escala solo cambia cómo se escriben y se muestran.')),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Cálculo de la nota'), modoSeg),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Nota final'), finalSeg),
    h('h3', { class: 'section-label cb-sec' }, 'Instrumentos (modo porcentajes)'),
    insList, total,
    h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { D.instrumentos.push({ id: uid(), nombre: '', peso: 0 }); paintInstrumentos(); insList.querySelector('.cb-row:last-child input').focus(); } }, icon('plus', 14), 'Añadir instrumento'),
    h('h3', { class: 'section-label cb-sec' }, 'Criterios de evaluación (modo criterios)'),
    critList,
    h('div', { class: 'cb-inline-actions' },
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { D.criterios.push({ id: uid(), codigo: '', descripcion: '', peso: 1 }); paintCriterios(); critList.querySelector('.cb-row:last-child input').focus(); } }, icon('plus', 14), 'Añadir criterio')),
    pasteDet,
    h('h3', { class: 'section-label cb-sec' }, 'Valor de cada nivel'),
    h('p', { class: 'cb-hint' }, 'Nota (0–10) que se guarda al elegir cada nivel.'),
    levelInputs,
    warnBox,
    h('div', { class: 'cb-actions' }, h('span', { class: 'cb-spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar')),
    h('div', { class: 'cb-danger' }, del.trigger, del.box));

  paintWarnings();
  const close = openSheet('Configurar cuaderno', form);
  return close;
}
