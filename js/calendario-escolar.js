// Tabula · calendario escolar de Andalucía y paso al nuevo curso (lógica + escritura en store).
//
// El calendario se guarda como eventos normales (colección "events") con origen 'calendario-escolar',
// así lo usan sin cambios Hoy, el Calendario, la asistencia y la planificación automática
// (que ya salta los eventos de tipo 'nolectivo').

import { store, uid } from './store.js';

/**
 * Calendarios disponibles. Fuente: calendarios de las Delegaciones Territoriales de Educación 2026-27
 * (fechas comunes a las ocho provincias; los 2 festivos locales y los 2 días de libre disposición
 * los fija cada Consejo Escolar Municipal y se añaden a mano).
 */
export const PRESETS = {
  '2026-27': {
    nombre: 'Andalucía · curso 2026-27',
    inicio: '2026-09-10',
    fin: '2027-06-23',
    nolectivos: [
      { fecha: '2026-10-12', titulo: 'Fiesta Nacional de España' },
      { fecha: '2026-11-02', titulo: 'Lunes siguiente a Todos los Santos' },
      { fecha: '2026-12-07', titulo: 'Lunes siguiente al Día de la Constitución' },
      { fecha: '2026-12-08', titulo: 'Inmaculada Concepción' },
      { fecha: '2026-12-24', fechaFin: '2027-01-08', titulo: 'Vacaciones de Navidad' },
      { fecha: '2027-02-26', titulo: 'Día de la Comunidad Educativa' },
      { fecha: '2027-03-01', titulo: 'Lunes siguiente al Día de Andalucía' },
      { fecha: '2027-03-22', fechaFin: '2027-03-28', titulo: 'Vacaciones de Semana Santa' },
    ],
    // Propuesta editable: el centro fija las sesiones de evaluación
    evaluaciones: [
      { fecha: '2026-12-23', titulo: 'Fin de la 1.ª evaluación' },
      { fecha: '2027-03-19', titulo: 'Fin de la 2.ª evaluación' },
      { fecha: '2027-06-23', titulo: 'Fin de curso · evaluación final' },
    ],
  },
};

export const ORIGEN = 'calendario-escolar';
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

/** Eventos que genera un calendario (sin ids). */
export function presetEvents(year, { evaluaciones = true } = {}) {
  const p = PRESETS[year];
  if (!p) return [];
  const [y0] = year.split('-').map(Number);
  const ev = (o, tipo) => ({ titulo: o.titulo, fecha: o.fecha, fechaFin: o.fechaFin || null, hora: null, tipo, groupId: null, notas: '', origen: ORIGEN, cursoEscolar: year });
  return [
    ev({ titulo: 'Antes del inicio de las clases', fecha: `${y0}-09-01`, fechaFin: addDays(p.inicio, -1) }, 'nolectivo'),
    ev({ titulo: 'Inicio de las clases', fecha: p.inicio }, 'otro'),
    ...p.nolectivos.map((o) => ev(o, 'nolectivo')),
    ...(evaluaciones ? p.evaluaciones.map((o) => ev(o, 'evaluacion')) : []),
    ev({ titulo: 'Vacaciones de verano', fecha: addDays(p.fin, 1), fechaFin: `${y0 + 1}-08-31` }, 'nolectivo'),
  ];
}

/** ¿Está ya cargado el calendario de ese curso? */
export const presetLoaded = (year) => store.list('events').some((e) => e.origen === ORIGEN && e.cursoEscolar === year);

/**
 * Carga (o vuelve a cargar) el calendario de un curso. Sustituye solo los eventos que creó antes este mismo
 * calendario; los que añadió el docente (festivos locales, libre disposición…) no se tocan.
 * @returns { added, removed, undo }
 */
export function applyPreset(year, opts) {
  const old = store.list('events').filter((e) => e.origen === ORIGEN && e.cursoEscolar === year);
  old.forEach((e) => store.remove('events', e.id));
  const added = presetEvents(year, opts).map((e) => store.add('events', e));
  return {
    added: added.length, removed: old.length,
    undo: () => { added.forEach((e) => store.remove('events', e.id)); old.forEach((e) => store.restore('events', e)); },
  };
}

// ---------- Nuevo curso ----------
export const nextSchoolYear = (y) => { const a = Number(String(y).slice(0, 4)); return `${a + 1}-${String(a + 2).slice(2)}`; };

/** "1º A" → "2º A" (si el nombre empieza por el número del curso). */
export function promotedName(nombre, curso, nuevoCurso) {
  const re = new RegExp(`^\\s*${curso}\\s*(º|°|\\.º)?`);
  return re.test(nombre) ? nombre.replace(re, `${nuevoCurso}º`) : nombre;
}

/**
 * Prepara el paso de curso. Para cada grupo activo del curso `year`:
 *   accion 'continuar' → nuevo grupo con el mismo alumnado y curso + 1 (6º no puede continuar)
 *   accion 'nuevo'     → nuevo grupo vacío (curso elegido), para pegar después la lista
 *   accion 'nada'      → no se crea grupo
 * Los grupos antiguos se archivan: sus cuadernos, asistencia y notas se conservan y se pueden consultar.
 * @param decisions { [groupId]: { accion, curso?, nombre?, horario: 'mantener'|'vaciar' } }
 * @returns { groups:[{from, data}], students:[{from, data}], scheduleMoves:[{scheduleId, toFrom}], archive:[groupId] }
 */
export function planNewYear(groups, students, schedule, decisions, year) {
  const ny = nextSchoolYear(year);
  const plan = { year: ny, groups: [], students: [], scheduleMoves: [], scheduleClear: [], archive: [] };
  for (const g of groups.filter((x) => !x.archivado && (x.cursoEscolar || year) === year)) {
    const d = decisions[g.id] || { accion: 'nada' };
    plan.archive.push(g.id);
    const slots = schedule.filter((s) => s.groupId === g.id);
    if (d.accion === 'nada') { if (d.horario === 'vaciar') plan.scheduleClear.push(...slots.map((s) => s.id)); continue; }
    const curso = d.accion === 'continuar' ? Math.min(6, (Number(g.curso) || 0) + 1) : Number(d.curso) || Number(g.curso) || 1;
    const nombre = d.nombre || (d.accion === 'continuar' ? promotedName(g.nombre, g.curso, curso) : `${curso}º`);
    const tempId = `new:${g.id}`;
    plan.groups.push({ from: g.id, tempId, data: { nombre, curso, cursoEscolar: ny, color: g.color, tutoria: g.tutoria, archivado: false } });
    if (d.accion === 'continuar') {
      for (const s of students.filter((x) => x.groupId === g.id)) {
        const { id, groupId, createdAt, updatedAt, ...rest } = s;
        plan.students.push({ from: s.id, groupTemp: tempId, data: rest });
      }
    }
    if (d.horario === 'vaciar') plan.scheduleClear.push(...slots.map((s) => s.id));
    else plan.scheduleMoves.push(...slots.map((s) => ({ scheduleId: s.id, groupTemp: tempId })));
  }
  return plan;
}

/** Ejecuta un plan de planNewYear. Devuelve { groups, students, undo }. */
export function applyNewYear(plan) {
  const before = { groups: [], schedule: [] };
  const map = {};
  const createdGroups = plan.groups.map((g) => { const ng = store.add('groups', g.data); map[g.tempId] = ng.id; return ng; });
  const createdStudents = plan.students.map((s) => store.add('students', { ...s.data, groupId: map[s.groupTemp] }));
  for (const m of plan.scheduleMoves) {
    const s = store.get('schedule', m.scheduleId);
    if (s) { before.schedule.push(s); store.update('schedule', s.id, { groupId: map[m.groupTemp] }); }
  }
  for (const id of plan.scheduleClear) {
    const s = store.get('schedule', id);
    if (s) { before.schedule.push(s); store.update('schedule', id, { groupId: null, area: '' }); }
  }
  for (const id of plan.archive) {
    const g = store.get('groups', id);
    if (g) { before.groups.push(g); store.update('groups', id, { archivado: true }); }
  }
  return {
    groups: createdGroups, students: createdStudents,
    undo: () => {
      createdStudents.forEach((s) => store.remove('students', s.id));
      createdGroups.forEach((g) => store.remove('groups', g.id));
      before.schedule.forEach((s) => store.restore('schedule', s));
      before.groups.forEach((g) => store.restore('groups', g));
    },
  };
}

export { uid };
