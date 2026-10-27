// Tabula · Planes y programas · hoja de alta/edición de un programa (archivar y eliminar)
import { store } from '../../store.js';
import { h, icon, toast, openSheet } from '../../ui.js';
import { currentSchoolYear } from '../../school.js';
import { PROGRAM_TYPES, ROLES, createProgram, slugTag, listEntries } from '../../programs.js';
import { COLORS, COLOR_NAMES, colorOf, field, plural } from './common.js';

/** Sugerencias rápidas para el estado vacío. */
export const SUGGESTIONS = [
  { nombre: 'STEAM 4.0', tipo: 'programa', rol: 'coordinador', color: 't3' },
  { nombre: 'Plan de Igualdad', tipo: 'plan', rol: 'participante', color: 't4' },
  { nombre: 'Creciendo en Salud', tipo: 'programa', rol: 'participante', color: 't6' },
];

/**
 * Abre la hoja de un programa. program=null → nuevo (con `prefill` opcional).
 * onSaved(p) al guardar; onDeleted() tras eliminarlo.
 */
export function openProgramSheet(program = null, { prefill = {}, onSaved, onDeleted } = {}) {
  const isNew = !program;
  const base = { nombre: '', tipo: 'programa', rol: 'coordinador', cursoEscolar: currentSchoolYear(), descripcion: '', color: null, etiqueta: '', ...prefill, ...(program || {}) };
  let color = COLORS.includes(base.color) ? base.color : COLORS[store.list('programas').length % COLORS.length];
  let tagTouched = !isNew; // en programas existentes la etiqueta no se recalcula sola

  const nombre = h('input', { class: 'input', type: 'text', value: base.nombre, placeholder: 'Ej. STEAM 4.0', maxlength: 60, autocomplete: 'off' });
  const tipo = h('select', { class: 'select' }, Object.entries(PROGRAM_TYPES).map(([k, v]) => h('option', { value: k, selected: k === base.tipo }, v)));
  const rol = h('select', { class: 'select' }, Object.entries(ROLES).map(([k, v]) => h('option', { value: k, selected: k === base.rol }, v)));
  const escolar = h('input', { class: 'input', type: 'text', value: base.cursoEscolar, placeholder: '2026-27', inputmode: 'numeric', maxlength: 7, autocomplete: 'off' });
  const descr = h('textarea', { class: 'textarea', rows: 3, maxlength: 600, placeholder: 'Opcional: de qué trata, cuál es tu papel…' });
  descr.value = base.descripcion || '';
  const etiqueta = h('input', {
    class: 'input pg-tag-input', type: 'text', value: base.etiqueta || (base.nombre ? slugTag(base.nombre) : ''), placeholder: 'steam-4-0', maxlength: 24, autocomplete: 'off',
    'aria-describedby': 'pg-tag-hint', oninput: () => { tagTouched = true; },
  });
  nombre.addEventListener('input', () => { if (!tagTouched) etiqueta.value = nombre.value.trim() ? slugTag(nombre.value) : ''; });
  const error = h('p', { class: 'pg-error', role: 'alert', hidden: true });

  const swatches = h('div', { class: 'pg-swatches', role: 'radiogroup', 'aria-label': 'Color del programa' },
    COLORS.map((c) => h('button', {
      type: 'button', role: 'radio', class: `pg-swatch pg-c-${c}`, 'aria-label': COLOR_NAMES[c], title: COLOR_NAMES[c],
      'aria-checked': String(c === color), dataset: { c },
      onclick: () => { color = c; swatches.querySelectorAll('.pg-swatch').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.c === c))); },
    }, icon('check', 18))));

  const submit = (e) => {
    e.preventDefault();
    const name = nombre.value.trim();
    if (!name) { error.textContent = 'Escribe un nombre.'; error.hidden = false; nombre.focus(); return; }
    const ce = /^\d{4}-\d{2}$/.test(escolar.value.trim()) ? escolar.value.trim() : currentSchoolYear();
    const tag = slugTag(etiqueta.value || name);
    const data = { nombre: name, tipo: tipo.value, rol: rol.value, cursoEscolar: ce, descripcion: descr.value.trim(), color, etiqueta: tag };
    let saved;
    if (isNew) saved = createProgram(data);
    else {
      // Si cambia la etiqueta, las tareas ya vinculadas la siguen a la nueva
      if (program.etiqueta && program.etiqueta !== tag) {
        store.list('tasks').filter((t) => (t.tags || []).includes(program.etiqueta)).forEach((t) =>
          store.update('tasks', t.id, { tags: [...new Set(t.tags.map((x) => (x === program.etiqueta ? tag : x)))] }));
      }
      saved = store.update('programas', program.id, data);
    }
    close();
    toast(isNew ? `«${name}» creado` : 'Programa actualizado');
    onSaved && onSaved(saved);
  };

  // --- Archivar / eliminar (solo al editar)
  const confirmBox = h('div', { class: 'confirm-box', role: 'alertdialog', 'aria-label': 'Confirmar eliminación', hidden: true });
  let archiveBtn = null, deleteBtn = null;
  if (!isNew) {
    archiveBtn = h('button', {
      type: 'button', class: 'btn btn-ghost',
      onclick: () => {
        const archivado = !program.archivado;
        store.update('programas', program.id, { archivado });
        close();
        toast(archivado ? `«${program.nombre}» archivado` : `«${program.nombre}» restaurado`,
          { label: 'Deshacer', run: () => store.update('programas', program.id, { archivado: !archivado }) });
        onSaved && onSaved({ ...program, archivado });
      },
    }, program.archivado ? 'Restaurar' : 'Archivar');
    deleteBtn = h('button', {
      type: 'button', class: 'btn btn-ghost btn-danger',
      onclick: () => {
        const n = listEntries(program.id).length;
        confirmBox.replaceChildren(
          h('p', {}, `¿Eliminar «${program.nombre}»${n ? ` y ${plural(n, 'anotación', 'anotaciones')} de su diario` : ''}? Las tareas y reuniones del calendario no se borran.`),
          h('div', { class: 'pg-confirm-actions' },
            h('button', { type: 'button', class: 'btn', onclick: () => { confirmBox.hidden = true; deleteBtn.hidden = false; } }, 'Cancelar'),
            h('button', { type: 'button', class: 'btn btn-primary pg-danger-solid', onclick: () => removeProgram(program, close, onDeleted) }, 'Sí, eliminar')));
        confirmBox.hidden = false; deleteBtn.hidden = true;
        confirmBox.querySelector('button').focus();
      },
    }, icon('trash', 16), 'Eliminar');
  }

  const form = h('form', { class: 'pg-form', onsubmit: submit, novalidate: true },
    field('Nombre', nombre), error,
    h('div', { class: 'pg-two' }, field('Tipo', tipo), field('Mi papel', rol)),
    field('Curso escolar', escolar),
    field('Descripción', descr),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Color'), swatches),
    h('div', { class: 'field' },
      h('label', { for: 'pg-etiqueta' }, 'Etiqueta para tareas'),
      h('div', { class: 'pg-tag-wrap' }, h('span', { class: 'pg-tag-hash', 'aria-hidden': 'true' }, '#'), etiqueta),
      h('span', { class: 'pg-hint', id: 'pg-tag-hint' }, 'Las tareas con esta etiqueta aparecen en el programa. Ej.: ',
        h('b', {}, `#${etiqueta.value || 'steam-4-0'}`))),
    confirmBox,
    h('div', { class: 'pg-actions' }, archiveBtn, deleteBtn,
      h('span', { class: 'pg-spacer' }),
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, isNew ? 'Crear' : 'Guardar')));
  etiqueta.id = 'pg-etiqueta';
  const exampleTag = form.querySelector('#pg-tag-hint b');
  etiqueta.addEventListener('input', () => { exampleTag.textContent = `#${etiqueta.value || nombre.value.trim() ? slugTag(etiqueta.value || nombre.value) : 'steam-4-0'}`; });
  nombre.addEventListener('input', () => { exampleTag.textContent = `#${etiqueta.value || nombre.value.trim() ? slugTag(etiqueta.value || nombre.value) : 'steam-4-0'}`; });

  const close = openSheet(isNew ? 'Nuevo programa' : 'Editar programa', form);
  setTimeout(() => nombre.focus(), 80);
  return close;
}

/** Elimina el programa y su diario; «Deshacer» lo restaura todo. */
export function removeProgram(program, close, onDeleted) {
  const entries = store.list('diarioPrograma').filter((e) => e.programaId === program.id);
  const full = store.get('programas', program.id);
  entries.forEach((e) => store.remove('diarioPrograma', e.id));
  store.remove('programas', program.id);
  close && close();
  toast(`«${program.nombre}» eliminado`, {
    label: 'Deshacer',
    run: () => { store.restore('programas', full); entries.forEach((e) => store.restore('diarioPrograma', e)); },
  });
  onDeleted && onDeleted();
}
