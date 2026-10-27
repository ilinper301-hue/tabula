// Tabula · Ajustes · asistente de nuevo curso (archiva el curso actual y prepara los grupos del siguiente)
import { store } from '../../store.js';
import { h, icon, openSheet, toast } from '../../ui.js';
import { getGroups, currentSchoolYear } from '../../school.js';
import { nextSchoolYear, promotedName, planNewYear, applyNewYear, PRESETS, presetLoaded } from '../../calendario-escolar.js';
import { loadCalendar } from './calendario-escolar.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Curso escolar de los grupos activos (el más frecuente); si no hay grupos, el que marca la fecha. */
export function activeYear() {
  const count = {};
  getGroups().forEach((g) => { const y = g.cursoEscolar || currentSchoolYear(); count[y] = (count[y] || 0) + 1; });
  const best = Object.entries(count).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
  return best ? best[0] : currentSchoolYear();
}
const groupsOf = (year) => getGroups().filter((g) => (g.cursoEscolar || year) === year);

/** Tarjeta «Nuevo curso» para Ajustes. */
export function nuevoCursoCard() {
  const year = activeYear();
  const ny = nextSchoolYear(year);
  return h('section', { class: 'card', id: 'ajustes-nuevo-curso' },
    h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Nuevo curso')),
    h('p', { class: 'settings-text' }, `Cuando acabe el curso ${year}, prepara el ${ny}: tus grupos actuales se archivan (con sus cuadernos, notas y asistencia) y creas los nuevos, con el mismo alumnado si continúas con él.`),
    h('div', { class: 'settings-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => openNuevoCurso() }, icon('planificacion', 18), `Preparar el curso ${ny}`)));
}

export function openNuevoCurso() {
  const year = activeYear();
  const ny = nextSchoolYear(year);
  const groups = groupsOf(year);
  const schedule = store.list('schedule');
  const students = store.list('students');
  const nSlots = (g) => schedule.filter((s) => s.groupId === g.id).length;
  const nStudents = (g) => students.filter((s) => s.groupId === g.id).length;

  const dec = {};
  groups.forEach((g) => { dec[g.id] = { accion: g.curso >= 6 ? 'nada' : 'continuar', curso: Math.min(6, g.curso), nombre: '', horario: 'mantener', editedName: false }; });

  const wiz = h('div', { class: 'tu-wiz' });
  let step = 1, result = null, undone = false, close;
  const decisions = () => Object.fromEntries(Object.entries(dec).map(([id, d]) => [id, { accion: d.accion, curso: d.curso, nombre: d.nombre.trim() || undefined, horario: d.horario }]));
  const plan = () => planNewYear(store.list('groups'), store.list('students'), store.list('schedule'), decisions(), year);

  const steps = () => h('ol', { class: 'tu-steps', 'aria-label': `Paso ${Math.min(step, 4)} de 4` }, [1, 2, 3, 4].map((n) => h('li', { class: n <= step ? 'on' : '' })));
  const heading = (t) => h('h3', { class: 'sr-only', tabindex: '-1', id: 'nc-h' }, t);
  const nav = (back, next) => h('div', { class: 'tu-actions' },
    back ? h('button', { type: 'button', class: 'btn', onclick: back[1] }, back[0]) : h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => close() }, 'Cancelar'),
    h('span', { class: 'tu-spacer' }),
    next && h('button', { type: 'button', class: 'btn btn-primary', onclick: next[1] }, next[0]));
  const go = (n) => { step = n; paint(); const hd = wiz.querySelector('#nc-h'); if (hd) hd.focus(); };

  // ---- Paso 1
  function step1() {
    if (!groups.length) {
      return [steps(), h('p', { class: 'tu-wiz-lead' }, `No tienes grupos activos del curso ${year}. Crea uno en Grupos para poder prepararlo.`),
        h('div', { class: 'tu-actions' }, h('a', { class: 'btn btn-primary', href: '#/grupos', onclick: () => close() }, 'Ir a Grupos'))];
    }
    return [steps(), heading('Antes de empezar'),
      h('p', { class: 'tu-wiz-lead' }, `Vas a pasar del curso ${year} al ${ny}. Se archiva el curso actual: los cuadernos, notas y asistencia se conservan y se pueden consultar.`),
      h('ul', { class: 'tu-wiz-list' },
        h('li', {}, `Tus ${plural(groups.length, 'grupo', 'grupos')} del ${year} pasan a «Cursos anteriores», en Grupos.`),
        h('li', {}, 'Para cada uno eliges si continúas con él, tendrás un grupo nuevo o ya no lo tendrás.'),
        h('li', {}, 'Las reuniones y medidas de Tutoría se quedan con el grupo archivado.'),
        h('li', {}, 'Al terminar podrás deshacerlo.')),
      nav(null, ['Empezar', () => go(2)])];
  }

  // ---- Paso 2
  function groupCard(g) {
    const d = dec[g.id];
    const n = nStudents(g), slots = nSlots(g);
    const promoted = Math.min(6, g.curso + 1);
    const radio = (value, title, hint, disabled = false) => h('label', { class: 'tu-opt' },
      h('input', { type: 'radio', name: `acc-${g.id}`, value, checked: d.accion === value, disabled,
        onchange: () => { d.accion = value; paint(); const r = wiz.querySelector(`input[name="acc-${g.id}"][value="${value}"]`); if (r) r.focus(); } }),
      h('span', { class: 'tu-opt-text' }, title, h('small', {}, hint)));
    const sub = [];
    if (d.accion === 'nuevo') {
      const nombre = h('input', { class: 'input', id: `nc-n-${g.id}`, type: 'text', maxlength: 40, autocomplete: 'off', value: d.nombre || promotedName(g.nombre, g.curso, d.curso), placeholder: `Ej. ${d.curso}º A`,
        oninput: () => { d.nombre = nombre.value; d.editedName = true; } });
      if (!d.nombre) d.nombre = nombre.value;
      const curso = h('select', { class: 'select', id: `nc-c-${g.id}`, onchange: () => {
        d.curso = Number(curso.value);
        if (!d.editedName) { d.nombre = promotedName(g.nombre, g.curso, d.curso); nombre.value = d.nombre; }
      } }, [1, 2, 3, 4, 5, 6].map((c) => h('option', { value: String(c), selected: c === d.curso }, `${c}º de Primaria`)));
      sub.push(h('div', { class: 'tu-sub tu-two' },
        h('div', { class: 'field' }, h('label', { for: curso.id }, 'Curso'), curso),
        h('div', { class: 'field' }, h('label', { for: nombre.id }, 'Nombre del grupo'), nombre)));
    }
    const horario = slots
      ? h('fieldset', { class: 'tu-opts', style: { border: '0', padding: '0', margin: '0', minWidth: '0' } },
        h('legend', { class: 'field-label', style: { marginBottom: '6px', padding: '0' } }, `Horario (${plural(slots, 'sesión', 'sesiones')} con este grupo)`),
        h('label', { class: 'tu-opt' }, h('input', { type: 'radio', name: `hor-${g.id}`, checked: d.horario === 'mantener', onchange: () => { d.horario = 'mantener'; } }),
          h('span', { class: 'tu-opt-text' }, 'Mantener mi horario', h('small', {}, d.accion === 'nada' ? 'Las sesiones se quedan como están, con el grupo archivado.' : 'Las sesiones pasan al nuevo grupo.'))),
        h('label', { class: 'tu-opt' }, h('input', { type: 'radio', name: `hor-${g.id}`, checked: d.horario === 'vaciar', onchange: () => { d.horario = 'vaciar'; } }),
          h('span', { class: 'tu-opt-text' }, 'Vaciar el horario de este grupo', h('small', {}, 'Quedan los huecos libres para rellenarlos de nuevo.')))) : null;
    // «Ya no lo tendré» + «mantener»: el plan no mueve las sesiones; se explica arriba
    return h('section', { class: 'tu-wiz-group', 'aria-label': g.nombre },
      h('h3', {}, g.nombre, h('span', { class: 'tu-hint', style: { marginLeft: '10px', fontFamily: 'var(--font-sans)', fontSize: '13px' } }, `${g.curso}º · ${plural(n, 'alumno', 'alumnos')}`)),
      h('div', { class: 'tu-opts', role: 'radiogroup', 'aria-label': `Qué harás con ${g.nombre}` },
        radio('continuar', 'Continúo con este grupo', g.curso >= 6 ? '6º termina la etapa: no se puede continuar.' : `Pasa a ${promotedName(g.nombre, g.curso, promoted)} con ${plural(n, 'alumno', 'alumnos')}.`, g.curso >= 6),
        radio('nuevo', 'Tendré un grupo nuevo', 'Se crea vacío; pegas la lista del alumnado después.'),
        radio('nada', 'Ya no lo tendré', 'Solo se archiva.')),
      ...sub, horario);
  }
  function step2() {
    return [steps(), heading('Tus grupos'), h('p', { class: 'tu-wiz-lead' }, 'Elige qué pasa con cada grupo del curso que termina.'),
      ...groups.map(groupCard),
      nav(['Atrás', () => go(1)], ['Revisar', () => {
        const bad = groups.find((g) => dec[g.id].accion === 'nuevo' && !dec[g.id].nombre.trim());
        if (bad) { toast(`Pon nombre al grupo nuevo de ${bad.nombre}`); const i = wiz.querySelector(`#nc-n-${bad.id}`); i && i.focus(); return; }
        go(3);
      }])];
  }

  // ---- Paso 3
  function step3() {
    const p = plan();
    const rows = groups.map((g) => {
      const d = dec[g.id];
      const ng = p.groups.find((x) => x.from === g.id);
      const slots = nSlots(g);
      const sch = !slots ? null : d.horario === 'vaciar' ? `Horario: se vacían ${plural(slots, 'sesión', 'sesiones')}.`
        : ng ? `Horario: ${plural(slots, 'sesión pasa', 'sesiones pasan')} a ${ng.data.nombre}.` : `Horario: ${plural(slots, 'sesión se queda', 'sesiones se quedan')} como está.`;
      const title = d.accion === 'continuar' ? `${g.nombre} → ${ng.data.nombre}` : d.accion === 'nuevo' ? `Grupo nuevo: ${ng.data.nombre}` : `${g.nombre}: ya no lo tendrás`;
      const sub = d.accion === 'continuar' ? `${plural(p.students.filter((s) => s.groupTemp === ng.tempId).length, 'alumno pasa', 'alumnos pasan')} contigo.`
        : d.accion === 'nuevo' ? `${ng.data.curso}º, sin alumnado: pega la lista en Grupos.` : null;
      return h('div', { class: 'tu-sum-row' }, h('strong', {}, title), sub ? h('span', {}, sub) : null, sch ? h('span', {}, sch) : null);
    });
    return [steps(), heading('Resumen'), h('p', { class: 'tu-wiz-lead' }, `Esto es lo que va a pasar al aplicar el cambio al curso ${ny}:`),
      h('div', { class: 'tu-sum' }, rows,
        h('div', { class: 'tu-sum-row' }, h('strong', {}, `Se archivan ${plural(p.archive.length, 'grupo', 'grupos')} del curso ${year}`), h('span', {}, 'Sus cuadernos, notas y asistencia se conservan en «Cursos anteriores».'))),
      nav(['Atrás', () => go(2)], ['Aplicar cambios', apply])];
  }

  function apply() {
    result = applyNewYear(plan());
    undone = false;
    toast('Nuevo curso preparado', { label: 'Deshacer', run: undo });
    go(4);
  }
  function undo() {
    if (!result || undone) return;
    result.undo();
    undone = true;
    if (document.body.contains(wiz)) paint();
  }

  // ---- Paso 4
  function step4() {
    if (undone) {
      return [h('div', { class: 'tu-done' }, icon('check', 40), heading('Cambios deshechos'), h('h3', {}, 'Todo vuelve a estar como antes'), h('p', { class: 'tu-hint' }, 'Tus grupos del curso actual siguen activos.')),
        h('div', { class: 'tu-actions' }, h('span', { class: 'tu-spacer' }), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => close() }, 'Cerrar'))];
    }
    const created = result.groups;
    const empty = created.filter((g) => !store.list('students').some((s) => s.groupId === g.id));
    const link = (href, icn, text, hint) => h('a', { class: 'btn tu-link', href, onclick: () => close() }, icon(icn, 18), h('span', { class: 'tu-opt-text' }, text, h('small', {}, hint)));
    return [h('div', { class: 'tu-done' }, icon('check', 40), heading('Hecho'), h('h3', {}, `Curso ${ny} preparado`),
      h('p', { class: 'tu-hint' }, created.length ? `${plural(created.length, 'grupo nuevo', 'grupos nuevos')} y ${plural(result.students.length, 'alumno', 'alumnos')} pasados al nuevo curso.` : 'El curso anterior queda archivado.')),
    h('div', { class: 'tu-links' },
      empty.length
        ? link(`#/grupos?id=${encodeURIComponent(empty[0].id)}`, 'grupos', 'Pegar la lista del alumnado', `Grupo ${empty[0].nombre}, vacío por ahora.`)
        : link('#/grupos', 'grupos', 'Revisar tus grupos', 'Los antiguos están en «Cursos anteriores».'),
      link('#/cuaderno', 'cuaderno', 'Abrir el Cuaderno', 'Los criterios de evaluación se cargan solos según el curso.'),
      PRESETS[ny] && !presetLoaded(ny)
        ? h('button', { type: 'button', class: 'btn tu-link', onclick: (e) => { loadCalendar(ny); e.currentTarget.remove(); } }, icon('calendario', 18),
          h('span', { class: 'tu-opt-text' }, `Cargar el calendario escolar ${ny}`, h('small', {}, 'Fechas oficiales de Andalucía.'))) : null),
    h('div', { class: 'tu-actions' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: undo }, 'Deshacer'), h('span', { class: 'tu-spacer' }),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => close() }, 'Cerrar'))];
  }

  function paint() {
    const parts = { 1: step1, 2: step2, 3: step3, 4: step4 }[step]();
    wiz.replaceChildren(...parts.filter(Boolean));
  }
  paint();
  close = openSheet(`Nuevo curso ${ny}`, wiz);
  requestAnimationFrame(() => { const s = wiz.closest('.sheet'); if (s) { s.classList.add('tu-sheet'); s.style.setProperty('--tu-w', '580px'); } });
  return close;
}
