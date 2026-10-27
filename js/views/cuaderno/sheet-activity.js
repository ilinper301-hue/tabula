// Tabula · Cuaderno · hoja de actividad (nueva / editar)
import { store, uid } from '../../store.js';
import { h, icon, toast, todayISO, openSheet } from '../../ui.js';
import { EVALUACIONES } from '../../grading.js';
import { currentEv, removeActivity, restoreActivity } from './model.js';
import { field, segmented, confirmDelete, trunc } from './common.js';

const num = (v, fallback) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : fallback; };

/**
 * Abre la hoja de una actividad.
 * @param gb         cuaderno
 * @param activity   actividad a editar (null = nueva)
 * @param ev         evaluación seleccionada en la pantalla ('1'|'2'|'3'|'final')
 * @param onSaved    (actividad) => void
 */
export function openActivitySheet({ gb, activity = null, ev, onSaved }) {
  const isNew = !activity;
  const f = {
    nombre: activity?.nombre || '',
    fecha: activity?.fecha || todayISO(),
    evaluacion: String(activity?.evaluacion || (ev === 'final' ? currentEv() : ev)),
    tipo: activity?.tipo || 'nota',
    instrumentoId: activity?.instrumentoId || '',
    criterioIds: new Set((activity?.criterioIds || []).filter((id) => (gb.criterios || []).some((c) => c.id === id))),
    peso: activity?.peso ?? 1,
    niveles: activity?.rubrica?.niveles || 4,
    aspectos: (activity?.rubrica?.aspectos || [
      { id: uid(), nombre: '', peso: 1 }, { id: uid(), nombre: '', peso: 1 }, { id: uid(), nombre: '', peso: 1 },
    ]).map((a) => ({ ...a })),
  };

  const error = h('p', { class: 'cb-error', role: 'alert', hidden: true });
  const showError = (m, el) => { error.textContent = m; error.hidden = false; error.scrollIntoView({ block: 'nearest' }); el && el.focus(); };

  const nombre = h('input', { class: 'input', type: 'text', value: f.nombre, maxlength: 80, placeholder: 'Ej. Examen de fracciones', autocomplete: 'off' });
  const fecha = h('input', { class: 'input', type: 'date', value: f.fecha });
  const evSel = h('select', { class: 'select' }, EVALUACIONES.filter((e) => e.id !== 'final')
    .map((e) => h('option', { value: e.id, selected: e.id === f.evaluacion }, e.label)));
  const peso = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: '0.1', step: '0.5', value: String(f.peso) });

  // Instrumento
  const insSel = h('select', { class: 'select' },
    h('option', { value: '' }, gb.modo === 'porcentajes' ? 'Elige un instrumento…' : 'Sin instrumento'),
    (gb.instrumentos || []).map((i) => h('option', { value: i.id, selected: i.id === f.instrumentoId }, `${i.nombre} (${i.peso} %)`)));

  // Criterios (chips seleccionables)
  const critBox = h('div', { class: 'cb-crit-pick', role: 'group', 'aria-label': 'Criterios de evaluación' });
  if (!(gb.criterios || []).length) {
    critBox.append(h('p', { class: 'cb-hint' }, 'Aún no hay criterios. Añádelos en «Configurar» para vincularlos a las actividades.'));
  }
  (gb.criterios || []).forEach((cr) => {
    const b = h('button', {
      type: 'button', class: 'cb-crit-chip', 'aria-pressed': String(f.criterioIds.has(cr.id)), title: `${cr.codigo} ${cr.descripcion || ''}`.trim(),
      onclick: () => {
        if (f.criterioIds.has(cr.id)) f.criterioIds.delete(cr.id); else f.criterioIds.add(cr.id);
        b.setAttribute('aria-pressed', String(f.criterioIds.has(cr.id)));
      },
    }, h('strong', {}, cr.codigo || '·'), cr.descripcion ? h('span', {}, trunc(cr.descripcion, 46)) : null);
    critBox.append(b);
  });

  // Rúbrica
  const nivSel = h('select', { class: 'select' }, [3, 4, 5].map((n) => h('option', { value: String(n), selected: n === f.niveles }, `${n} niveles`)));
  const aspList = h('div', { class: 'cb-asp-list' });
  function paintAspectos() {
    aspList.replaceChildren(...f.aspectos.map((a, i) => {
      const n = h('input', { class: 'input', type: 'text', value: a.nombre, maxlength: 60, placeholder: `Aspecto ${i + 1}`, 'aria-label': `Nombre del aspecto ${i + 1}`, oninput: () => { a.nombre = n.value; } });
      const p = h('input', { class: 'input cb-w-num', type: 'number', inputmode: 'decimal', min: '0.1', step: '0.5', value: String(a.peso ?? 1), 'aria-label': `Peso del aspecto ${i + 1}`, oninput: () => { a.peso = num(p.value, 1); } });
      return h('div', { class: 'cb-asp-row' }, n, p,
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': `Quitar aspecto ${i + 1}`, disabled: f.aspectos.length <= 1,
          onclick: () => { f.aspectos.splice(i, 1); paintAspectos(); },
        }, icon('x', 18)));
    }));
  }
  paintAspectos();
  const rubBox = h('div', { class: 'cb-rub-box' },
    field('Niveles de la rúbrica', nivSel),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Aspectos a valorar (nombre y peso)'), aspList,
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { f.aspectos.push({ id: uid(), nombre: '', peso: 1 }); paintAspectos(); aspList.querySelector('.cb-asp-row:last-child input').focus(); } },
        icon('plus', 14), 'Añadir aspecto')));

  const tipoSeg = segmented([['nota', 'Nota'], ['rubrica', 'Rúbrica']], f.tipo, (v) => { f.tipo = v; rubBox.hidden = v !== 'rubrica'; }, 'Tipo de actividad');
  rubBox.hidden = f.tipo !== 'rubrica';

  function submit(e) {
    e.preventDefault();
    const name = nombre.value.trim();
    if (!name) return showError('Escribe un nombre para la actividad.', nombre);
    if (!fecha.value) return showError('Elige la fecha de la actividad.', fecha);
    const w = num(peso.value, NaN);
    if (!(w > 0)) return showError('El peso debe ser mayor que 0.', peso);
    if (gb.modo === 'porcentajes' && !insSel.value) return showError('Elige el instrumento de evaluación: sin él la actividad no cuenta para la nota.', insSel);
    if (gb.modo === 'criterios' && !f.criterioIds.size) {
      return showError((gb.criterios || []).length ? 'Elige al menos un criterio de evaluación.' : 'Primero añade los criterios del área en «Configurar».');
    }
    const data = {
      nombre: name, fecha: fecha.value, evaluacion: Number(evSel.value), tipo: f.tipo,
      instrumentoId: insSel.value || null,
      criterioIds: (gb.criterios || []).map((c) => c.id).filter((id) => f.criterioIds.has(id)),
      peso: w,
    };
    let remap = null;
    if (f.tipo === 'rubrica') {
      const aspectos = f.aspectos.map((a, i) => ({ id: a.id, nombre: (a.nombre || '').trim() || `Aspecto ${i + 1}`, peso: a.peso > 0 ? a.peso : 1 }));
      data.rubrica = { niveles: Number(nivSel.value), aspectos };
      // Las notas guardan el nivel por POSICIÓN de aspecto: si se quitan o reordenan, reajustamos lo ya puntuado.
      const oldIds = (activity?.rubrica?.aspectos || []).map((a) => a.id);
      if (oldIds.length && oldIds.join() !== aspectos.map((a) => a.id).join()) {
        remap = (r) => aspectos.map((a) => { const k = oldIds.indexOf(a.id); return k >= 0 ? (r[k] ?? null) : null; });
      }
    } else data.rubrica = null;

    let saved;
    if (isNew) saved = store.add('activities', { gradebookId: gb.id, ...data });
    else {
      saved = store.update('activities', activity.id, data);
      if (remap) {
        const doc = store.list('grades').find((g) => g.activityId === activity.id);
        if (doc) {
          const notas = {};
          for (const [sid, en] of Object.entries(doc.notas || {})) notas[sid] = Array.isArray(en.r) ? { ...en, r: remap(en.r) } : en;
          store.update('grades', doc.id, { notas });
        }
      }
    }
    close();
    const evLabel = EVALUACIONES.find((x) => x.id === String(data.evaluacion))?.label;
    if (ev !== 'final' && String(data.evaluacion) !== String(ev)) toast(`Actividad guardada en la ${evLabel}`);
    else toast(isNew ? 'Actividad añadida' : 'Actividad actualizada');
    onSaved && onSaved(saved);
  }

  const del = !isNew && confirmDelete({
    label: 'Eliminar actividad', yes: 'Sí, eliminar',
    question: `Se eliminará «${activity.nombre}» y todas las notas que contiene.`,
    onYes: () => {
      const undo = removeActivity(activity.id);
      close();
      toast('Actividad eliminada', { label: 'Deshacer', run: () => restoreActivity(undo) });
    },
  });

  const form = h('form', { class: 'cb-form', onsubmit: submit, novalidate: true },
    field('Nombre', nombre),
    h('div', { class: 'cb-two' }, field('Fecha', fecha), field('Evaluación', evSel)),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tipo'), tipoSeg),
    rubBox,
    field(gb.modo === 'porcentajes' ? 'Instrumento (obligatorio)' : 'Instrumento (opcional)', insSel),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, gb.modo === 'criterios' ? 'Criterios de evaluación (obligatorio)' : 'Criterios de evaluación (opcional)'), critBox),
    field('Peso', peso, 'Peso dentro de su instrumento/criterio'),
    error,
    del ? del.box : null,
    h('div', { class: 'cb-actions' }, del ? del.trigger : null, h('span', { class: 'cb-spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, isNew ? 'Añadir' : 'Guardar')));

  const close = openSheet(isNew ? 'Nueva actividad' : 'Editar actividad', form);
  return close;
}
