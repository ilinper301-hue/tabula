// Tabula · Grupos · pestaña «Alumnado»
import { store } from '../../store.js';
import { h, icon } from '../../ui.js';
import { getGroup, getStudents, listName } from '../../school.js';
import { avatar, colorOf, norm, plural } from './common.js';
import { openAddStudents, openFicha } from './sheets.js';
import { tallyByStudent } from '../../observations.js';
import { openQuickObservation } from '../anecdotario/quick.js';
import { tallyEl } from '../anecdotario/common.js';

/** Pinta la lista de alumnado en `panel`. Devuelve la función de limpieza. */
export function mountAlumnado(panel, groupId) {
  let query = '';

  const search = h('input', {
    class: 'input gr-search-input', type: 'search', placeholder: 'Buscar alumno…', autocomplete: 'off',
    'aria-label': 'Buscar alumno', oninput: (e) => { query = e.target.value; paintList(); },
  });
  const searchBox = h('div', { class: 'gr-search' }, icon('search', 18), search);
  const count = h('div', { class: 'section-label gr-count' });
  const addBtn = h('button', { type: 'button', class: 'btn', onclick: () => openAddStudents(groupId) },
    icon('plus', 16), 'Añadir alumnado');
  // Acción principal del día a día: registrar una observación rápida (anecdotario)
  const observeBtn = h('button', { type: 'button', class: 'btn btn-primary ao-observe', onclick: () => openQuickObservation({ groupId }) },
    icon('plus', 16), 'Observar');
  const list = h('div', { class: 'gr-student-list' });

  panel.replaceChildren(
    h('div', { class: 'gr-toolbar' }, searchBox, h('div', { class: 'gr-toolbar-actions' }, addBtn, observeBtn)),
    count, h('div', { class: 'card gr-card-list' }, list));

  function paintList() {
    const group = getGroup(groupId);
    if (!group) return;
    const color = colorOf(group);
    const all = getStudents(groupId);
    const obs = tallyByStudent(groupId);
    observeBtn.hidden = !all.length;
    // El buscador aparece con más de 12 alumnos (o mientras haya texto escrito).
    searchBox.hidden = all.length <= 12 && !query;
    const q = norm(query.trim());
    const shown = q ? all.filter((s) => norm(`${s.nombre} ${s.apellidos}`).includes(q)) : all;
    count.textContent = q ? `${plural(shown.length, 'resultado', 'resultados')} de ${all.length}` : plural(all.length, 'alumno', 'alumnos');

    if (!all.length) {
      list.replaceChildren(h('div', { class: 'empty' }, icon('grupos', 40),
        h('strong', {}, 'Este grupo aún no tiene alumnado'),
        'Pega la lista desde Séneca o Excel, o añade a cada alumno uno a uno.',
        h('div', { class: 'gr-empty-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openAddStudents(groupId) }, icon('plus', 16), 'Añadir alumnado'))));
      return;
    }
    if (!shown.length) { list.replaceChildren(h('div', { class: 'empty' }, `Nadie coincide con «${query.trim()}».`)); return; }

    list.replaceChildren(...shown.map((s) => h('button', {
      type: 'button', class: 'gr-student', onclick: () => openFicha(s.id),
      'aria-label': `Abrir ficha de ${listName(s)}`,
    },
    avatar(s, color),
    h('span', { class: 'gr-student-name' }, listName(s)),
    tallyEl(obs[s.id], { cls: 'ao-mini', neutral: true }),
    s.medidas && s.medidas.trim()
      ? h('span', { class: 'gr-flag', title: 'Tiene medidas de atención a la diversidad' }, icon('flag', 14),
        h('span', { class: 'sr-only' }, 'Tiene medidas de atención a la diversidad'))
      : null,
    icon('chevronRight', 16, 'gr-chev'))));
  }

  paintList();
  const unsubs = ['students', 'groups', 'observaciones'].map((c) => store.subscribe(c, paintList));
  return () => unsubs.forEach((u) => u());
}
