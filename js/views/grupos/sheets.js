// Tabula · Grupos · hojas (paneles) de edición: grupo, alta de alumnado y ficha del alumno
import { store } from '../../store.js';
import { h, icon, toast } from '../../ui.js';
import { getGroup, getStudents, fullName, listName, currentSchoolYear } from '../../school.js';
import { openSheet } from '../../ui.js';
import { parseStudentList } from './parse-students.js';
import { COLORS, COLOR_NAMES, colorOf, plural, norm, reorderStudents } from './common.js';
import { groupDocs, studentStats } from './summary.js';
import { renderStudentObservations } from '../anecdotario/list.js';
import { openQuickObservation } from '../anecdotario/quick.js';

const focusLater = (el) => setTimeout(() => el.focus(), 80);

/** Campo etiquetado: field('Nombre', input) */
const field = (label, control, hint) => {
  const id = control.id || (control.id = 'f' + Math.random().toString(36).slice(2, 8));
  return h('div', { class: 'field' },
    h('label', { for: id }, label), control,
    hint ? h('span', { class: 'gr-hint' }, hint) : null);
};

// ============================================================
// Grupo: crear / editar / archivar
// ============================================================
export function openGroupSheet(group = null, { onSaved } = {}) {
  const isNew = !group;
  let color = group ? colorOf(group) : COLORS[store.list('groups').length % COLORS.length];

  const nombre = h('input', { class: 'input', type: 'text', value: group?.nombre || '', placeholder: 'Ej. 1º A', maxlength: 40, autocomplete: 'off' });
  const curso = h('select', { class: 'select' },
    [1, 2, 3, 4, 5, 6].map((n) => h('option', { value: String(n), selected: n === (group?.curso || 1) }, `${n}º de Primaria`)));
  const escolar = h('input', { class: 'input', type: 'text', value: group?.cursoEscolar || currentSchoolYear(), placeholder: '2026-27', pattern: '\\d{4}-\\d{2}', inputmode: 'numeric', maxlength: 7 });
  const tutoria = h('input', { type: 'checkbox', class: 'gr-switch', role: 'switch', checked: group ? !!group.tutoria : true });
  const error = h('p', { class: 'gr-error', role: 'alert', hidden: true });

  const swatches = h('div', { class: 'gr-swatches', role: 'radiogroup', 'aria-label': 'Color del grupo' },
    COLORS.map((c) => h('button', {
      type: 'button', role: 'radio', class: `gr-swatch gr-c-${c}`, 'aria-label': COLOR_NAMES[c], title: COLOR_NAMES[c],
      'aria-checked': String(c === color), dataset: { c },
      onclick: () => {
        color = c;
        swatches.querySelectorAll('.gr-swatch').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.c === c)));
      },
    }, icon('check', 18))));

  const submit = (e) => {
    e.preventDefault();
    const name = nombre.value.trim();
    if (!name) { error.textContent = 'Escribe un nombre para el grupo.'; error.hidden = false; nombre.focus(); return; }
    const ce = /^\d{4}-\d{2}$/.test(escolar.value.trim()) ? escolar.value.trim() : currentSchoolYear();
    const data = { nombre: name, curso: Number(curso.value), cursoEscolar: ce, color, tutoria: tutoria.checked };
    const saved = isNew ? store.add('groups', { ...data, archivado: false }) : store.update('groups', group.id, data);
    close();
    toast(isNew ? `Grupo ${name} creado` : 'Grupo actualizado');
    onSaved && onSaved(saved);
  };

  const archiveBtn = !isNew && h('button', {
    type: 'button', class: 'btn btn-ghost',
    onclick: () => {
      const archivado = !group.archivado;
      store.update('groups', group.id, { archivado });
      close();
      toast(archivado ? `${group.nombre} archivado` : `${group.nombre} restaurado`,
        { label: 'Deshacer', run: () => store.update('groups', group.id, { archivado: !archivado }) });
    },
  }, group.archivado ? 'Restaurar grupo' : 'Archivar grupo');

  const form = h('form', { class: 'gr-form', onsubmit: submit, novalidate: true },
    field('Nombre del grupo', nombre), error,
    h('div', { class: 'gr-two' }, field('Curso', curso), field('Curso escolar', escolar)),
    h('label', { class: 'gr-toggle' },
      h('span', {}, h('strong', {}, 'Soy el tutor o tutora'), h('small', {}, 'Marca este grupo como tu tutoría.')), tutoria),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Color'), swatches),
    h('div', { class: 'gr-actions' }, archiveBtn,
      h('span', { class: 'gr-spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, isNew ? 'Crear grupo' : 'Guardar')));

  const close = openSheet(isNew ? 'Nuevo grupo' : 'Editar grupo', form);
  focusLater(nombre);
  return close;
}

// ============================================================
// Alta de alumnado: uno a uno o pegando una lista
// ============================================================
const newStudent = (groupId, nombre, apellidos) =>
  store.add('students', { groupId, nombre, apellidos, orden: 9999, medidas: '', observaciones: '', contacto: '' });

export function openAddStudents(groupId) {
  let mode = 'uno';

  // ---- Modo 1: uno a uno (se queda abierto para ir añadiendo)
  const nombre = h('input', { class: 'input', type: 'text', autocomplete: 'off', maxlength: 60 });
  const apellidos = h('input', { class: 'input', type: 'text', autocomplete: 'off', maxlength: 80 });
  const oneError = h('p', { class: 'gr-error', role: 'alert', hidden: true });
  const oneForm = h('form', { class: 'gr-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const n = nombre.value.trim(), a = apellidos.value.trim();
    if (!n) { oneError.textContent = 'El nombre es obligatorio.'; oneError.hidden = false; nombre.focus(); return; }
    oneError.hidden = true;
    const s = newStudent(groupId, n, a);
    reorderStudents(groupId);
    toast(`${fullName(s)} añadido`, { label: 'Deshacer', run: () => store.remove('students', s.id) });
    nombre.value = ''; apellidos.value = '';
    nombre.focus();
  } },
  field('Nombre', nombre), oneError, field('Apellidos', apellidos),
  h('div', { class: 'gr-actions' }, h('span', { class: 'gr-spacer' }),
    h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cerrar'),
    h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus', 16), 'Añadir')));

  // ---- Modo 2: pegar lista con vista previa
  const ta = h('textarea', {
    class: 'textarea gr-paste', rows: 7, spellcheck: 'false', id: 'gr-paste-ta',
    placeholder: 'Una persona por línea, por ejemplo:\nGarcía López, María\nLucía Martín Ruiz\nNavarro Díaz\tHugo',
  });
  const preview = h('div', { class: 'gr-preview' });
  const addBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Añadir alumnos');
  let toAdd = [];

  const paintPreview = () => {
    const existing = new Set(getStudents(groupId).map((s) => norm(listName(s))));
    const rows = parseStudentList(ta.value);
    toAdd = [];
    rows.forEach((r) => {
      r.dup = existing.has(norm(listName(r)));
      if (!r.dup) { toAdd.push(r); existing.add(norm(listName(r))); } else r.dup = true;
    });
    if (!rows.length) {
      preview.replaceChildren(h('p', { class: 'gr-hint' }, 'Pega aquí la lista desde Séneca, Excel o un documento. Verás cómo se interpreta antes de añadirla.'));
    } else {
      preview.replaceChildren(
        h('p', { class: 'gr-hint' }, `Vista previa: ${plural(rows.length, 'línea', 'líneas')}`),
        h('div', { class: 'gr-table-wrap' },
          h('table', { class: 'gr-table gr-preview-table' },
            h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Nombre'), h('th', { scope: 'col' }, 'Apellidos'))),
            h('tbody', {}, rows.map((r) => h('tr', { class: r.dup ? 'is-dup' : null },
              h('td', {}, r.nombre),
              h('td', {}, r.apellidos || h('span', { class: 'gr-faint' }, '—'),
                r.dup ? h('span', { class: 'chip t5 gr-dup' }, 'Ya está en el grupo') : null)))))));
    }
    addBtn.disabled = !toAdd.length;
    addBtn.textContent = toAdd.length ? `Añadir ${plural(toAdd.length, 'alumno', 'alumnos')}` : 'Añadir alumnos';
  };
  ta.addEventListener('input', paintPreview);
  addBtn.addEventListener('click', () => {
    if (!toAdd.length) return;
    const added = toAdd.map((r) => newStudent(groupId, r.nombre, r.apellidos));
    reorderStudents(groupId);
    close();
    toast(`${plural(added.length, 'alumno añadido', 'alumnos añadidos')}`,
      { label: 'Deshacer', run: () => added.forEach((s) => store.remove('students', s.id)) });
  });
  const pasteForm = h('div', { class: 'gr-form' },
    field('Lista de alumnado', ta), preview,
    h('div', { class: 'gr-actions' }, h('span', { class: 'gr-spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'), addBtn));
  paintPreview();

  // ---- Selector de modo (los dos paneles existen siempre: no se pierde lo escrito)
  const modes = [['uno', 'Uno a uno'], ['lista', 'Pegar lista']];
  const tabs = h('div', { class: 'segmented gr-modes', role: 'tablist', 'aria-label': 'Forma de añadir' },
    modes.map(([k, label]) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(k === mode), dataset: { m: k },
      onclick: () => {
        mode = k;
        tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === k)));
        oneForm.hidden = k !== 'uno'; pasteForm.hidden = k !== 'lista';
        focusLater(k === 'uno' ? nombre : ta);
      },
    }, label)));
  pasteForm.hidden = true;

  const close = openSheet('Añadir alumnado', h('div', {}, tabs, oneForm, pasteForm));
  focusLater(nombre);
  return close;
}

// ============================================================
// Ficha del alumno
// ============================================================
export function openFicha(studentId) {
  const s = store.get('students', studentId);
  if (!s) return null;
  const group = getGroup(s.groupId);

  const nombre = h('input', { class: 'input', type: 'text', value: s.nombre || '', maxlength: 60, autocomplete: 'off' });
  const apellidos = h('input', { class: 'input', type: 'text', value: s.apellidos || '', maxlength: 80, autocomplete: 'off' });
  const medidas = h('textarea', { class: 'textarea', rows: 3, maxlength: 1500 }, s.medidas || '');
  const observaciones = h('textarea', { class: 'textarea', rows: 3, maxlength: 3000 }, s.observaciones || '');
  const contacto = h('input', { class: 'input', type: 'text', value: s.contacto || '', maxlength: 200, autocomplete: 'off', placeholder: 'Teléfono, correo, persona de contacto…' });
  const error = h('p', { class: 'gr-error', role: 'alert', hidden: true });

  // Resumen de asistencia del curso escolar del grupo
  const st = group ? studentStats(groupDocs(group), s.id) : { faltas: 0, retrasos: 0, justificadas: 0, dias: 0, pct: null };
  const stat = (n, label) => h('div', { class: 'gr-stat' }, h('strong', {}, String(n)), h('span', {}, label));
  const asistencia = h('section', { class: 'gr-ficha-stats', 'aria-label': 'Asistencia este curso' },
    h('div', { class: 'section-label' }, `Asistencia · curso ${group?.cursoEscolar || ''}`),
    h('div', { class: 'gr-stats' },
      stat(st.faltas, 'Faltas'), stat(st.retrasos, 'Retrasos'), stat(st.justificadas, 'Justificadas'),
      stat(st.pct === null ? '—' : `${st.pct} %`, 'Asistencia')),
    h('p', { class: 'gr-hint' }, st.dias ? `Sobre ${plural(st.dias, 'día registrado', 'días registrados')}.` : 'Todavía no se ha pasado lista.'));

  // Anecdotario: observaciones del alumno (lista con edición en línea) y acceso al registro rápido
  const obsBox = h('div', { class: 'ao-ficha-list' });
  const stopObs = renderStudentObservations(obsBox, s.id);
  const obsSection = h('section', { class: 'ao-ficha', 'aria-label': 'Observaciones' },
    h('div', { class: 'ao-ficha-head' },
      h('div', { class: 'section-label' }, 'Observaciones'),
      h('button', { type: 'button', class: 'btn btn-sm ao-add', onclick: () => openQuickObservation({ groupId: s.groupId, studentIds: [s.id] }) },
        icon('plus', 14), 'Añadir')),
    obsBox);

  const save = (e) => {
    e.preventDefault();
    const n = nombre.value.trim();
    if (!n) { error.textContent = 'El nombre es obligatorio.'; error.hidden = false; nombre.focus(); return; }
    store.update('students', s.id, {
      nombre: n, apellidos: apellidos.value.trim(), medidas: medidas.value.trim(),
      observaciones: observaciones.value.trim(), contacto: contacto.value.trim(),
    });
    reorderStudents(s.groupId);
    close();
    toast('Ficha guardada');
  };

  // Confirmación de borrado dentro de la propia hoja (sin window.confirm)
  const actions = h('div', { class: 'gr-actions' },
    h('button', { type: 'button', class: 'btn btn-ghost btn-danger', onclick: () => { actions.hidden = true; confirmBox.hidden = false; } },
      icon('trash', 16), 'Eliminar'),
    h('span', { class: 'gr-spacer' }),
    h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar'));
  const confirmBox = h('div', { class: 'gr-confirm', role: 'alertdialog', 'aria-label': 'Confirmar eliminación', hidden: true },
    h('p', {}, h('strong', {}, `¿Eliminar a ${fullName(s)}?`),
      ' Se borrará su ficha. Podrás deshacerlo unos segundos.'),
    h('div', { class: 'gr-actions' }, h('span', { class: 'gr-spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: () => { confirmBox.hidden = true; actions.hidden = false; } }, 'No, conservar'),
      h('button', { type: 'button', class: 'btn btn-primary gr-btn-danger', onclick: () => {
        const removed = store.remove('students', s.id);
        close();
        toast(`${fullName(s)} eliminado`, { label: 'Deshacer', run: () => { if (removed) { store.restore('students', removed); reorderStudents(s.groupId); } } });
      } }, 'Sí, eliminar')));

  const form = h('form', { class: 'gr-form', onsubmit: save, novalidate: true },
    h('div', { class: 'gr-two' }, field('Nombre', nombre), field('Apellidos', apellidos)), error,
    field('Medidas de atención a la diversidad', medidas, 'Apoyos, adaptaciones, refuerzos… Solo para uso docente.'),
    field('Observaciones', observaciones),
    field('Contacto de la familia', contacto),
    asistencia, obsSection, actions, confirmBox);

  const close = openSheet('Ficha del alumno', form, { onClose: stopObs });
  focusLater(nombre);
  return close;
}
