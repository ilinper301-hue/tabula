// Tabula · Tutoría · hoja de una reunión (crear, editar, cerrar con resumen y acuerdos, imprimir acta)
import { store, uid } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { getGroup, getStudents } from '../../school.js';
import { TIPOS_REUNION, MODALIDADES, INICIATIVA } from '../../tutoria.js';
import { field, segmented, studentPicker, wideSheet, todayISO, sheet } from './common.js';
import { saveReunion, deleteReunion } from './data.js';
import { printActa } from './acta.js';

const options = (map, cur) => Object.entries(map).map(([k, v]) => h('option', { value: k, selected: k === cur }, v));

/**
 * @param opts { groupId, reunionId?, defaults?: partial de reunión, cerrar?: boolean (abrir pidiendo «¿Cómo fue?») }
 * @returns close()
 */
export function openReunion({ groupId, reunionId = null, defaults = {}, cerrar = false } = {}) {
  const existing = reunionId ? store.get('reuniones', reunionId) : null;
  if (reunionId && !existing) { toast('No se encuentra esa reunión'); return null; }
  const gid = existing ? existing.groupId : groupId;
  const group = getGroup(gid);
  const students = getStudents(gid);
  const base = existing || {
    tipo: 'familia', studentIds: [], fecha: todayISO(), hora: '', modalidad: 'presencial', iniciativa: 'tutor',
    asistentes: '', motivo: '', resumen: '', acuerdos: [], estado: 'prevista', seguimiento: null, ...defaults,
  };
  const isNew = !existing;
  let acuerdos = (base.acuerdos || []).map((a) => ({ ...a }));

  const tipo = h('select', { class: 'select' }, options(TIPOS_REUNION, base.tipo));
  const picker = studentPicker(students, base.studentIds || []);
  const fecha = h('input', { class: 'input', type: 'date', value: base.fecha || '' });
  const hora = h('input', { class: 'input', type: 'time', value: base.hora || '' });
  const modalidad = h('select', { class: 'select' }, options(MODALIDADES, base.modalidad));
  const iniciativa = h('select', { class: 'select' }, options(INICIATIVA, base.iniciativa));
  const asistentes = h('input', { class: 'input', type: 'text', value: base.asistentes || '', maxlength: 200, autocomplete: 'off', placeholder: 'Quién asiste (madre, padre, PT, orientadora…)' });
  const motivo = h('textarea', { class: 'textarea', rows: 2, maxlength: 600, placeholder: 'Motivo de la reunión' }, base.motivo || '');
  const resumen = h('textarea', { class: 'textarea', rows: 4, maxlength: 4000, placeholder: 'Qué se habló y cómo fue' }, base.resumen || '');
  const seguimiento = h('input', { class: 'input', type: 'date', value: base.seguimiento || '' });
  const error = h('p', { class: 'tu-error', role: 'alert', hidden: true });

  const estado = segmented('Estado', [['prevista', 'Prevista'], ['realizada', 'Realizada'], ['cancelada', 'Cancelada']],
    cerrar ? 'realizada' : base.estado, () => paintEstado());

  // ---- Acuerdos
  const agBox = h('div', { class: 'tu-acuerdos' });
  function paintAcuerdos(focusLast = false) {
    agBox.replaceChildren(...acuerdos.map((a, i) => {
      const txt = h('input', { class: 'input', type: 'text', value: a.texto || '', maxlength: 300, 'aria-label': `Acuerdo ${i + 1}`, placeholder: 'Acuerdo', autocomplete: 'off',
        oninput: () => { a.texto = txt.value; } });
      const cb = h('input', { type: 'checkbox', class: 'check', checked: !!a.hecho, 'aria-label': `Acuerdo ${i + 1} cumplido`, onchange: () => { a.hecho = cb.checked; } });
      const dt = h('input', { class: 'input tu-ag-date', type: 'date', value: a.fecha || '', 'aria-label': `Fecha del acuerdo ${i + 1} (opcional)`, title: 'Fecha límite (opcional)',
        onchange: () => { a.fecha = dt.value || undefined; } });
      return h('div', { class: 'tu-ag-row' }, cb, txt, dt,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Quitar acuerdo ${i + 1}`, onclick: () => { acuerdos.splice(i, 1); paintAcuerdos(); } }, icon('x', 16)));
    }));
    if (focusLast) { const last = agBox.querySelector('.tu-ag-row:last-child input[type=text]'); if (last) last.focus(); }
  }
  paintAcuerdos();
  const addAg = h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { acuerdos.push({ id: uid(), texto: '', hecho: false }); paintAcuerdos(true); } },
    icon('plus', 14), 'Añadir acuerdo');

  const result = h('section', { class: 'tu-result', 'aria-label': 'Resultado de la reunión' },
    field('Resumen', resumen),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Acuerdos'), agBox, h('div', {}, addAg)),
    field('Fecha de seguimiento', seguimiento, 'Opcional: para volver a revisar cómo van los acuerdos.'));

  const markDone = h('button', { type: 'button', class: 'btn btn-sm tu-markdone', onclick: () => { estado.set('realizada'); paintEstado(); resumen.focus(); } },
    icon('check', 16), 'Marcar como realizada');
  const calNote = h('p', { class: 'tu-hint tu-calnote' }, icon('calendario', 14), 'Se añade al calendario y se quita si la cancelas.');

  function paintEstado() {
    const e = estado.get();
    result.hidden = e !== 'realizada';
    markDone.hidden = !(e === 'prevista' && !isNew);
    calNote.hidden = e === 'cancelada';
  }

  function collect() {
    return {
      groupId: gid, studentIds: picker.get(), fecha: fecha.value, hora: hora.value || null, tipo: tipo.value,
      modalidad: modalidad.value, iniciativa: iniciativa.value, asistentes: asistentes.value.trim(), motivo: motivo.value.trim(),
      resumen: resumen.value.trim(), acuerdos: acuerdos.filter((a) => (a.texto || '').trim()).map((a) => ({ ...a, texto: a.texto.trim() })),
      estado: estado.get(), seguimiento: seguimiento.value || null,
    };
  }
  const fail = (msg, el) => { error.textContent = msg; error.hidden = false; el && el.focus(); };

  const save = (e) => {
    e.preventDefault();
    const d = collect();
    if (!d.fecha) return fail('Elige la fecha de la reunión.', fecha);
    if (d.tipo === 'familia' && !d.studentIds.length) return fail('Elige al menos un alumno o alumna.', null);
    saveReunion(d, existing ? existing.id : null);
    close();
    toast(isNew ? 'Reunión creada' : 'Reunión guardada');
  };

  const profile = store.getSetting('profile', { nombre: '', centro: '' }) || {};
  const print = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => printActa(collect(), { students, profile, group }) },
    icon('printer', 16), 'Imprimir acta');
  const del = existing && h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: () => {
    const undo = deleteReunion(existing);
    close();
    toast('Reunión eliminada', { label: 'Deshacer', run: undo });
  } }, icon('trash', 16), 'Eliminar');

  const form = h('form', { class: 'tu-form', onsubmit: save, novalidate: true },
    h('div', { class: 'tu-two' }, field('Tipo', tipo), field('Fecha', fecha)),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Alumnado'), picker.el),
    h('div', { class: 'tu-three' }, field('Hora (opcional)', hora), field('Modalidad', modalidad), field('Convocada por', iniciativa)),
    field('Asistentes', asistentes),
    field('Motivo', motivo),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Estado'), estado.el, markDone, calNote),
    result, error,
    h('div', { class: 'tu-actions' }, del, print, h('span', { class: 'tu-spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar')));
  paintEstado();

  const close = sheet(isNew ? 'Nueva reunión' : 'Reunión', form);
  wideSheet(form, 560);
  if (cerrar) setTimeout(() => resumen.focus(), 260);
  return close;
}
