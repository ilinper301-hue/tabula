// Tabula · Planificación · hojas (nueva situación, programar, añadir varias, elegir área)
import { store } from '../../store.js';
import { h, icon, openSheet, toast, todayISO, addDaysISO } from '../../ui.js';
import { AREAS, areaShort, areaColor, getGroup } from '../../school.js';
import { scheduleSituacion, hasSlots } from '../../planning.js';
import {
  ctxFor, sesionesOf, sesionesOfSit, situacionesOf, applyChanges, addSession, currentEvaluacion, field,
  segmented, shortDate, plural,
} from './model.js';

/** Hoja "Nueva situación de aprendizaje". onCreated(situacion) se llama tras crearla. */
export function openNewSituacionSheet({ groupId, area, onCreated }) {
  const g = getGroup(groupId);
  const titulo = h('input', { class: 'input', type: 'text', placeholder: 'Por ejemplo: Los cuentos de la tradición oral', maxlength: 140 });
  const ev = h('select', { class: 'select' },
    [1, 2, 3].map((n) => h('option', { value: n, selected: n === currentEvaluacion() }, `${n}.ª evaluación`)));
  const desc = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Opcional: de qué trata y qué se quiere lograr' });
  const err = h('p', { class: 'pl-error', role: 'alert', hidden: true }, 'Escribe un título para la situación.');
  const submit = () => {
    const t = titulo.value.trim();
    if (!t) { err.hidden = false; titulo.focus(); return; }
    const mine = situacionesOf(groupId, area);
    const sit = store.add('situaciones', {
      groupId, area, titulo: t, evaluacion: Number(ev.value), descripcion: desc.value.trim(), productoFinal: '',
      criterioIds: [], orden: mine.reduce((m, s) => Math.max(m, s.orden ?? 0), -1) + 1, estado: 'borrador',
    });
    close();
    onCreated && onCreated(sit);
  };
  titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  const close = openSheet('Nueva situación de aprendizaje', h('div', { class: 'pl-sheet' },
    h('p', { class: 'pl-hint' }, `${g ? g.nombre + ' · ' : ''}${areaShort(area)}`),
    field('Título', titulo), err,
    field('Evaluación', ev), field('Descripción', desc),
    h('div', { class: 'pl-sheet-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: submit }, icon('plus', 16), 'Crear situación'))));
  return close;
}

/** Hoja "Programar en el horario": reparte las sesiones pendientes desde una fecha. */
export function openProgramSheet(sit) {
  const ctx0 = ctxFor(sit.groupId, sit.area);
  const own = sesionesOfSit(sit.id);
  const movable = own.filter((s) => s.estado === 'pendiente' && !s.fija);
  const movIds = new Set(movable.map((s) => s.id));
  // Por defecto: hoy, o el día siguiente a la última sesión ya programada de otras situaciones
  const lastOther = sesionesOf(sit.groupId, sit.area).filter((s) => !movIds.has(s.id) && s.fecha)
    .map((s) => s.fecha).sort().pop();
  const def = lastOther && addDaysISO(lastOther, 1) > todayISO() ? addDaysISO(lastOther, 1) : todayISO();

  const date = h('input', { class: 'input', type: 'date', value: def });
  const err = h('p', { class: 'pl-error', role: 'alert', hidden: true });
  const submit = () => {
    if (!date.value) { err.textContent = 'Elige una fecha de inicio.'; err.hidden = false; return; }
    const ctx = ctxFor(sit.groupId, sit.area);
    const changes = scheduleSituacion(sit.id, sesionesOf(sit.groupId, sit.area), ctx, date.value);
    close();
    if (!changes.length) { toast('No hay sesiones pendientes que programar'); return; }
    const undo = applyChanges(changes);
    const fechas = changes.map((c) => c.fecha).filter(Boolean).sort();
    const sin = changes.length - fechas.length;
    const msg = fechas.length
      ? `${plural(fechas.length, 'sesión programada', 'sesiones programadas')} del ${shortDate(fechas[0])} al ${shortDate(fechas[fechas.length - 1])}${sin ? `; ${plural(sin, 'sin hueco', 'sin hueco')}` : ''}`
      : 'No hay huecos libres en el horario';
    toast(msg, { label: 'Deshacer', run: undo });
  };
  date.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  const ok = hasSlots(ctx0);
  const close = openSheet('Programar en el horario', h('div', { class: 'pl-sheet' },
    h('p', { class: 'pl-hint' }, ok
      ? `Se colocarán ${plural(movable.length, 'sesión pendiente', 'sesiones pendientes')} de «${sit.titulo}» en los huecos libres del horario de ${areaShort(sit.area)}, saltando fines de semana y días no lectivos. Las sesiones hechas o con fecha fija no se mueven.`
      : `Este grupo no tiene sesiones de ${areaShort(sit.area)} en el horario.`),
    ok ? field('Empezar el', date, lastOther ? 'Propuesta: el día siguiente a la última sesión programada.' : null) : null,
    err,
    h('div', { class: 'pl-sheet-actions' },
      ok ? h('button', { type: 'button', class: 'btn btn-primary', disabled: !movable.length, onclick: submit }, icon('calendario', 16), 'Programar')
        : h('a', { class: 'btn btn-primary', href: '#/calendario?vista=horario', onclick: () => close() }, 'Ir al horario'))));
  return close;
}

/** Hoja "Añadir varias": crea N sesiones "Sesión k". */
export function openAddManySheet(sit) {
  const n = h('input', { class: 'input', type: 'number', min: 1, max: 40, value: 6, inputmode: 'numeric' });
  const submit = () => {
    const count = Math.max(1, Math.min(40, Math.floor(Number(n.value) || 0)));
    const own = sesionesOfSit(sit.id);
    let orden = own.reduce((m, s) => Math.max(m, s.orden ?? 0), 0);
    for (let i = 1; i <= count; i++) addSession(sit, ++orden, `Sesión ${own.length + i}`);
    close();
    toast(`${plural(count, 'sesión añadida', 'sesiones añadidas')}`);
  };
  n.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  const close = openSheet('Añadir varias sesiones', h('div', { class: 'pl-sheet' },
    field('¿Cuántas sesiones?', n, 'Se crearán con títulos «Sesión 1», «Sesión 2»… que podrás renombrar.'),
    h('div', { class: 'pl-sheet-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: submit }, icon('plus', 16), 'Añadir'))));
  return close;
}

/** Hoja para elegir otra área. */
export function openAreaPicker({ exclude, onPick }) {
  const rest = AREAS.filter((a) => !exclude.includes(a));
  const close = openSheet('Añadir área', h('div', { class: 'pl-area-list' },
    h('p', { class: 'pl-hint' }, 'Elige el área en la que quieres planificar.'),
    rest.map((a) => h('button', { type: 'button', class: 'pl-area-opt', onclick: () => { close(); onPick(a); } },
      h('span', { class: `chip ${areaColor(a)}` }, areaShort(a)), h('span', {}, a)))));
  return close;
}
