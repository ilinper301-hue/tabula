// Tabula · Tutoría · hoja de una medida de atención a la diversidad (crear, editar, seguimiento, finalizar)
import { store, uid } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { getGroup, getStudents, listName, AREAS, areaShort } from '../../school.js';
import { MEDIDAS, GRUPOS_MEDIDA } from '../../tutoria.js';
import { field, segmented, wideSheet, todayISO, mediumDate, pill, privacyNote, sheet } from './common.js';
import { deleteMedida } from './data.js';

const VAL = { positiva: ['Positiva', 't3'], regular: ['Regular', 't5'], negativa: ['Negativa', 't1'] };

export function openMedida({ groupId, medidaId = null, defaults = {} } = {}) {
  const existing = medidaId ? store.get('medidas', medidaId) : null;
  if (medidaId && !existing) { toast('No se encuentra esa medida'); return null; }
  const gid = existing ? existing.groupId : groupId;
  const group = getGroup(gid);
  const students = getStudents(gid);
  const isNew = !existing;
  const base = existing || { studentId: students[0] && students[0].id, tipo: 'pt', detalle: '', areas: [], profesional: '', horario: '', inicio: todayISO(), revision: '', estado: 'activa', ...defaults };
  const areas = new Set(base.areas || []);

  const alumno = h('select', { class: 'select' }, students.map((s) => h('option', { value: s.id, selected: s.id === base.studentId }, listName(s))));
  const tipo = h('select', { class: 'select' },
    Object.entries(GRUPOS_MEDIDA).map(([g, label]) => h('optgroup', { label },
      Object.entries(MEDIDAS).filter(([, v]) => v.grupo === g).map(([k, v]) => h('option', { value: k, selected: k === base.tipo }, v.label)))));
  const detalle = h('textarea', { class: 'textarea', rows: 3, maxlength: 1500, placeholder: 'En qué consiste la medida y qué objetivos tiene' }, base.detalle || '');
  const profesional = h('input', { class: 'input', type: 'text', value: base.profesional || '', maxlength: 100, autocomplete: 'off', placeholder: 'PT, AL, refuerzo…' });
  const horario = h('input', { class: 'input', type: 'text', value: base.horario || '', maxlength: 200, autocomplete: 'off', placeholder: 'Ej. martes y jueves, 10:00' });
  const inicio = h('input', { class: 'input', type: 'date', value: base.inicio || '' });
  const revision = h('input', { class: 'input', type: 'date', value: base.revision || '' });
  const error = h('p', { class: 'tu-error', role: 'alert', hidden: true });
  const estado = segmented('Estado de la medida', [['activa', 'Activa'], ['finalizada', 'Finalizada']], base.estado || 'activa');

  const areaBox = h('div', { class: 'tu-areas', role: 'group', 'aria-label': 'Áreas' }, AREAS.filter((a) => a !== 'Tutoría').map((a) => {
    const b = h('button', { type: 'button', class: 'tu-toggle', 'aria-pressed': String(areas.has(a)), onclick: () => {
      if (areas.has(a)) areas.delete(a); else areas.add(a);
      b.setAttribute('aria-pressed', String(areas.has(a)));
    } }, areaShort(a));
    return b;
  }));

  const collect = () => ({
    groupId: gid, studentId: alumno.value, tipo: tipo.value, detalle: detalle.value.trim(), areas: [...areas],
    profesional: profesional.value.trim(), horario: horario.value.trim(), inicio: inicio.value || todayISO(),
    revision: revision.value || null, estado: estado.get(),
    fin: estado.get() === 'finalizada' ? ((existing && existing.fin) || todayISO()) : null,
  });
  const save = (e) => {
    e.preventDefault();
    if (!alumno.value) { error.textContent = 'Elige un alumno o alumna.'; error.hidden = false; alumno.focus(); return; }
    const d = collect();
    if (existing) store.update('medidas', existing.id, d);
    else store.add('medidas', { seguimiento: [], ...d });
    close();
    toast(isNew ? 'Medida añadida' : 'Medida guardada');
  };

  // ---- Seguimiento (se guarda al momento, independiente del botón Guardar)
  const logBox = h('div', { class: 'tu-log' });
  const logDate = h('input', { class: 'input', type: 'date', value: todayISO(), 'aria-label': 'Fecha del seguimiento' });
  const logText = h('input', { class: 'input', type: 'text', maxlength: 500, autocomplete: 'off', placeholder: 'Anota cómo va…', 'aria-label': 'Texto del seguimiento' });
  const logVal = segmented('Valoración', [['', 'Sin valorar'], ['positiva', 'Positiva'], ['regular', 'Regular'], ['negativa', 'Negativa']], '');
  const patchLog = (fn) => {
    const cur = store.get('medidas', existing.id);
    if (!cur) return;
    store.update('medidas', existing.id, { seguimiento: fn([...(cur.seguimiento || [])]) });
    paintLog();
  };
  function paintLog() {
    const cur = store.get('medidas', existing.id);
    const items = [...((cur && cur.seguimiento) || [])].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    logBox.replaceChildren(...(items.length ? items.map((it) => h('div', { class: 'tu-log-item' },
      h('span', { class: 'tu-log-date' }, mediumDate(it.fecha)),
      h('span', { class: 'tu-log-text' }, it.texto, it.valoracion ? pill(VAL[it.valoracion][0], VAL[it.valoracion][1]) : null),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Quitar seguimiento del ${mediumDate(it.fecha)}`, onclick: () => {
        patchLog((arr) => arr.filter((x) => x.id !== it.id));
        toast('Seguimiento eliminado', { label: 'Deshacer', run: () => patchLog((arr) => [...arr, it]) });
      } }, icon('x', 16))))
      : [h('p', { class: 'tu-hint' }, 'Aún no hay anotaciones de seguimiento.')]));
  }
  const addLog = () => {
    const texto = logText.value.trim();
    if (!texto) { logText.focus(); return; }
    patchLog((arr) => [...arr, { id: uid(), fecha: logDate.value || todayISO(), texto, ...(logVal.get() ? { valoracion: logVal.get() } : {}) }]);
    logText.value = ''; logVal.set(''); logText.focus();
  };
  const seguimiento = existing && h('section', { class: 'tu-seguimiento', 'aria-label': 'Seguimiento' },
    h('h3', { class: 'section-label' }, 'Seguimiento'),
    h('div', { class: 'tu-log-add' },
      h('div', { class: 'tu-two' }, logDate, h('span')),
      logText, logVal.el,
      h('div', {}, h('button', { type: 'button', class: 'btn btn-sm', onclick: addLog }, icon('plus', 14), 'Añadir seguimiento'))),
    logBox);
  if (existing) { paintLog(); logText.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLog(); } }); }

  const finalizar = existing && existing.estado === 'activa' && h('button', { type: 'button', class: 'btn btn-sm tu-markdone', onclick: () => {
    const prev = store.get('medidas', existing.id);
    store.update('medidas', existing.id, { estado: 'finalizada', fin: todayISO() });
    close();
    toast('Medida finalizada', { label: 'Deshacer', run: () => store.restore('medidas', prev) });
  } }, icon('check', 14), 'Finalizar medida ahora');
  const del = existing && h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: () => {
    const undo = deleteMedida(existing);
    close();
    toast('Medida eliminada', { label: 'Deshacer', run: undo });
  } }, icon('trash', 16), 'Eliminar');

  const form = h('form', { class: 'tu-form', onsubmit: save, novalidate: true },
    field('Alumno', alumno),
    field('Medida', tipo),
    field('Detalle', detalle),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Áreas'), areaBox),
    h('div', { class: 'tu-two' }, field('Profesional', profesional), field('Horario', horario)),
    h('div', { class: 'tu-two' }, field('Inicio', inicio), field('Próxima revisión', revision)),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Estado'), estado.el, finalizar),
    error,
    h('div', { class: 'tu-actions' }, del, h('span', { class: 'tu-spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar')),
    seguimiento, privacyNote());

  const close = sheet(isNew ? 'Nueva medida' : 'Medida', form);
  wideSheet(form, 560);
  return close;
}
