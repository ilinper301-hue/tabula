// Paso 3 · Tu alumnado: pegar una lista, vista previa en vivo y alta en el grupo
import { store } from '../../store.js';
import { h } from '../../ui.js';
import { getStudents, listName } from '../../school.js';
import { parseStudentList } from '../grupos/parse-students.js';
import { norm, plural, reorderStudents } from '../grupos/common.js';
import { getDraft, setDraft } from './common.js';

export function stepAlumnado(ctx) {
  const groupId = ctx.st.groupId;
  const ta = h('textarea', {
    class: 'textarea bv-paste', id: 'bv-paste', rows: 8, spellcheck: 'false', autocomplete: 'off',
    placeholder: 'García López, María\nLucía Martín Ruiz\nNavarro Díaz\tHugo\n…',
  });
  ta.value = getDraft('lista', '');
  const preview = h('div', { class: 'bv-preview', 'aria-live': 'polite' });
  let toAdd = [];

  const paint = () => {
    const known = new Set(getStudents(groupId).map((s) => norm(listName(s))));
    const rows = parseStudentList(ta.value);
    toAdd = [];
    rows.forEach((r) => {
      r.dup = known.has(norm(listName(r)));
      if (!r.dup) { toAdd.push(r); known.add(norm(listName(r))); }
    });
    const already = getStudents(groupId).length;
    const dups = rows.length - toAdd.length;
    const alreadyNote = already ? h('p', { class: 'bv-hint' }, `El grupo ya tiene ${plural(already, 'alumno', 'alumnos')}.`) : null;
    if (!rows.length) {
      preview.replaceChildren(alreadyNote || h('p', { class: 'bv-hint' }, 'Verás aquí cómo se interpreta la lista antes de añadirla.'));
      return;
    }
    preview.replaceChildren(
      h('p', { class: 'bv-count' }, h('strong', {}, plural(toAdd.length, 'alumno', 'alumnos')),
        dups ? ` · ${plural(dups, 'repetido', 'repetidos')} (no se añadirán)` : null),
      alreadyNote || '',
      h('div', { class: 'bv-table-wrap' },
        h('table', { class: 'bv-table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Nombre'), h('th', { scope: 'col' }, 'Apellidos'))),
          h('tbody', {}, rows.map((r) => h('tr', { class: r.dup ? 'is-dup' : null },
            h('td', {}, r.nombre), h('td', {}, r.apellidos || '—')))))));
  };
  ta.addEventListener('input', () => { setDraft('lista', ta.value); paint(); });
  paint();

  const el = h('div', { class: 'bv-form' },
    h('div', { class: 'bv-field' },
      h('label', { for: 'bv-paste' }, 'Pega aquí la lista (una persona por línea). Vale la de Séneca o Excel.'), ta),
    preview);

  return {
    title: '¿Quiénes son tus alumnos?',
    lead: 'Copia la lista de tu documento y pégala. Nosotros separamos nombres y apellidos.',
    el,
    skipLabel: 'Lo haré después',
    next() {
      toAdd.forEach((r) => store.add('students', {
        groupId, nombre: r.nombre, apellidos: r.apellidos, orden: 9999, medidas: '', observaciones: '', contacto: '',
      }));
      if (toAdd.length) reorderStudents(groupId);   // orden alfabético por apellidos, como en Grupos
      setDraft('lista', '');
      return true;
    },
  };
}
