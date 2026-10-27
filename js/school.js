// Tabula · modelo de datos escolar compartido por Calendario, Grupos, Cuaderno y Hoy.
// Todas las colecciones se guardan con store.js. Este archivo define su forma y utilidades comunes.
//
// COLECCIONES
// groups      { id, nombre:'1º A', curso:1..6, cursoEscolar:'2026-27', color:'t1'..'t6', tutoria:boolean, archivado:boolean }
// students    { id, groupId, nombre, apellidos, orden:number, medidas:'' (atención a la diversidad),
//               observaciones:'', contacto:'' }
// schedule    { id, dia:1..5 (lunes=1), inicio:'HH:MM', fin:'HH:MM', tipo:'clase'|'recreo'|'otro',
//               area:'' (si clase), groupId:string|null, titulo:'' (si recreo/otro), aula:'' }
// events      { id, titulo, fecha:'YYYY-MM-DD', fechaFin:'YYYY-MM-DD'|null, hora:'HH:MM'|null,
//               tipo: clave de EVENT_TYPES, groupId:string|null, notas:'' }
// attendance  { id, groupId, fecha:'YYYY-MM-DD', registros:{ [studentId]: 'P'|'F'|'R'|'J' }, notas:'' }
//               Un documento por grupo y día. Si un alumno no aparece en registros, cuenta como Presente.

import { store } from './store.js';
import { todayISO } from './ui.js';

/** Áreas de Educación Primaria (LOMLOE, Andalucía). Editables en el futuro desde Ajustes. */
export const AREAS = [
  'Lengua Castellana y Literatura',
  'Matemáticas',
  'Conocimiento del Medio Natural, Social y Cultural',
  'Lengua Extranjera (Inglés)',
  'Educación Artística',
  'Educación Física',
  'Religión / Atención educativa',
  'Segunda Lengua Extranjera',
  'Educación en Valores Cívicos y Éticos',
  'Tutoría',
];

/** Nombre corto para chips y celdas pequeñas. */
export const AREA_SHORT = {
  'Lengua Castellana y Literatura': 'Lengua',
  'Matemáticas': 'Matemáticas',
  'Conocimiento del Medio Natural, Social y Cultural': 'C. del Medio',
  'Lengua Extranjera (Inglés)': 'Inglés',
  'Educación Artística': 'Artística',
  'Educación Física': 'E. Física',
  'Religión / Atención educativa': 'Religión / AE',
  'Segunda Lengua Extranjera': 'Francés',
  'Educación en Valores Cívicos y Éticos': 'Valores',
  'Tutoría': 'Tutoría',
};
export const areaShort = (a) => AREA_SHORT[a] || a || '';

/** Clase de color estable por área (para chips "chip tN" y bloques de horario). */
const AREA_COLOR = {
  'Lengua Castellana y Literatura': 't1', 'Matemáticas': 't3', 'Conocimiento del Medio Natural, Social y Cultural': 't6',
  'Lengua Extranjera (Inglés)': 't2', 'Educación Artística': 't4', 'Educación Física': 't5',
  'Religión / Atención educativa': 't2', 'Segunda Lengua Extranjera': 't4', 'Educación en Valores Cívicos y Éticos': 't5', 'Tutoría': 't1',
};
export const areaColor = (a) => AREA_COLOR[a] || 't2';

export const EVENT_TYPES = {
  evaluacion: { label: 'Evaluación', color: 't1' },
  reunion: { label: 'Reunión', color: 't2' },
  tutoria: { label: 'Tutoría con familias', color: 't6' },
  excursion: { label: 'Salida o excursión', color: 't3' },
  nolectivo: { label: 'No lectivo / festivo', color: 't5' },
  otro: { label: 'Otro', color: 't4' },
};

export const ATTENDANCE = {
  P: { label: 'Presente', short: 'P' },
  F: { label: 'Falta', short: 'F' },
  R: { label: 'Retraso', short: 'R' },
  J: { label: 'Falta justificada', short: 'J' },
};

export const DIAS_LECTIVOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

/** Curso escolar actual: de septiembre a agosto. */
export function currentSchoolYear(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
}

// ---------- Consultas comunes ----------
export const getGroups = ({ includeArchived = false } = {}) =>
  store.list('groups').filter((g) => includeArchived || !g.archivado)
    .sort((a, b) => (a.curso - b.curso) || a.nombre.localeCompare(b.nombre, 'es'));

export const getGroup = (id) => (id ? store.get('groups', id) : null);

export const getStudents = (groupId) =>
  store.list('students').filter((s) => s.groupId === groupId)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || fullName(a).localeCompare(fullName(b), 'es'));

export const fullName = (s) => [s.nombre, s.apellidos].filter(Boolean).join(' ');
/** "Apellidos, Nombre" para listas oficiales. */
export const listName = (s) => (s.apellidos ? `${s.apellidos}, ${s.nombre}` : s.nombre);
export const initials = (s) => ((s.nombre || '?')[0] + ((s.apellidos || '')[0] || '')).toUpperCase();

/** Sesiones del horario de un día (1=lunes … 5=viernes), ordenadas por hora. */
export const getSessionsForDay = (dia) =>
  store.list('schedule').filter((s) => s.dia === dia).sort((a, b) => a.inicio.localeCompare(b.inicio));

/** Sesiones de una fecha concreta (vacío en fin de semana). */
export function getSessionsForDate(iso = todayISO()) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay(); // 0 domingo
  return wd >= 1 && wd <= 5 ? getSessionsForDay(wd) : [];
}

/** Título legible de una sesión: área o título libre. */
export function sessionLabel(s) {
  if (s.tipo === 'recreo') return s.titulo || 'Recreo';
  if (s.tipo === 'otro') return s.titulo || 'Otra actividad';
  return s.area || 'Clase';
}

/** Eventos que ocurren en una fecha (tiene en cuenta eventos de varios días). */
export const getEventsForDate = (iso) =>
  store.list('events').filter((e) => e.fecha === iso || (e.fechaFin && e.fecha <= iso && iso <= e.fechaFin))
    .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

export const getAttendance = (groupId, fecha) =>
  store.list('attendance').find((a) => a.groupId === groupId && a.fecha === fecha) || null;

/** Guarda (crea o actualiza) la asistencia de un grupo en una fecha. */
export function saveAttendance(groupId, fecha, registros, notas = '') {
  const prev = getAttendance(groupId, fecha);
  return prev ? store.update('attendance', prev.id, { registros, notas })
    : store.add('attendance', { groupId, fecha, registros, notas });
}

/** Minutos desde medianoche de "HH:MM". */
export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
