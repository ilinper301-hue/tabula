// Paso 2 · Tu grupo: crea el grupo (o lo actualiza si el asistente ya lo había creado)
import { store } from '../../store.js';
import { h, icon } from '../../ui.js';
import { currentSchoolYear } from '../../school.js';
import { COLORS } from '../grupos/common.js';
import { field, errorBox, getDraft, setDraft } from './common.js';

export function stepGrupo(ctx) {
  const existing = ctx.st.groupId ? store.get('groups', ctx.st.groupId) : null;
  const draft = getDraft('grupo', {});
  let curso = draft.curso ?? existing?.curso ?? 1;
  let cursoElegido = draft.cursoElegido ?? !!existing;     // true si lo tocó la persona (no lo deducimos del nombre)

  const nombre = h('input', {
    class: 'input bv-input', type: 'text', maxlength: 40, autocomplete: 'off',
    placeholder: '1º A', value: draft.nombre ?? existing?.nombre ?? '',
  });
  const escolar = h('input', {
    class: 'input bv-input bv-input-sm', type: 'text', inputmode: 'numeric', maxlength: 7, placeholder: '2026-27',
    value: draft.escolar ?? existing?.cursoEscolar ?? currentSchoolYear(),
  });
  const tutoria = h('input', {
    type: 'checkbox', class: 'bv-switch', role: 'switch', id: 'bv-tutor',
    checked: draft.tutoria ?? (existing ? !!existing.tutoria : true),
  });
  const error = errorBox();

  const remember = () => setDraft('grupo', { nombre: nombre.value, curso, cursoElegido, escolar: escolar.value, tutoria: tutoria.checked });

  // Chips 1º–6º (grupo de opciones)
  const chips = h('div', { class: 'bv-chips', role: 'radiogroup', 'aria-label': 'Curso' });
  const paintChips = () => chips.querySelectorAll('button').forEach((b) => {
    const on = Number(b.dataset.n) === curso;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  [1, 2, 3, 4, 5, 6].forEach((n) => chips.append(h('button', {
    type: 'button', role: 'radio', class: 'bv-chip', dataset: { n }, 'aria-label': `${n}º de Primaria`,
    onclick: () => { curso = n; cursoElegido = true; paintChips(); remember(); },
    onkeydown: (e) => {                       // flechas para moverse entre chips
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      curso = ((curso - 1 + d + 6) % 6) + 1; cursoElegido = true; paintChips(); remember();
      chips.querySelector(`[data-n="${curso}"]`).focus();
    },
  }, `${n}º`)));
  paintChips();

  // Si escribe «3º B» y aún no ha tocado los chips, deducimos el curso.
  nombre.addEventListener('input', () => {
    const m = /^\s*([1-6])\s*[ºo°.]/i.exec(nombre.value) || /^\s*([1-6])\b/.exec(nombre.value);
    if (m && !cursoElegido) { curso = Number(m[1]); paintChips(); }
    error.clear(); remember();
  });
  escolar.addEventListener('input', remember);
  tutoria.addEventListener('change', remember);

  const el = h('form', { class: 'bv-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); ctx.next(); } },
    field('Nombre del grupo', nombre), error,
    h('div', { class: 'bv-field' }, h('span', { class: 'bv-label', id: 'bv-curso-l' }, 'Curso'), chips),
    h('label', { class: 'bv-toggle', for: 'bv-tutor' },
      h('span', { class: 'bv-toggle-text' }, h('strong', {}, 'Soy tutor/a de este grupo'),
        h('span', { class: 'bv-hint' }, 'Si lo eres, el grupo aparecerá como tu tutoría.')),
      tutoria),
    field('Curso escolar', escolar),
    h('p', { class: 'bv-note' }, icon('grupos', 16), '¿Das clase a más grupos? Podrás añadirlos después en Grupos.'),
    h('button', { type: 'submit', class: 'sr-only', tabindex: '-1' }, 'Siguiente'));

  return {
    title: '¿Qué grupo tienes?',
    lead: 'Empezamos por tu clase. Solo necesitamos un nombre y el curso.',
    el,
    skipLabel: 'Saltar este paso',
    next() {
      const name = nombre.value.trim();
      if (!name) { error.show('Ponle un nombre al grupo, por ejemplo 1º A.'); nombre.focus(); return false; }
      const ce = /^\d{4}-\d{2}$/.test(escolar.value.trim()) ? escolar.value.trim() : currentSchoolYear();
      const data = { nombre: name, curso, cursoEscolar: ce, tutoria: tutoria.checked };
      if (existing) store.update('groups', existing.id, data);
      else {
        const g = store.add('groups', { ...data, color: COLORS[store.list('groups').length % COLORS.length], archivado: false });
        ctx.st.groupId = g.id;
      }
      return true;
    },
  };
}
