// Tabula · Planes y programas educativos (lógica pura + consultas)
//
// COLECCIÓN 'programas' (sincronizada)
// { id, nombre: 'STEAM 4.0', tipo: 'programa' | 'plan' | 'proyecto',
//   rol: 'coordinador' | 'participante', cursoEscolar: '2026-27',
//   descripcion: '', color: 't1'..'t6',
//   etiqueta: 'steam'        (las tareas con #steam y los eventos con programaId aparecen en el programa),
//   objetivos: [{ id, texto, hecho: boolean }],
//   equipo:    [{ id, nombre, rol: '' }]      (compañeros: solo nombre y función, sin más datos),
//   enlaces:   [{ id, titulo, url }],
//   archivado: boolean }
//
// COLECCIÓN 'diarioPrograma' (sincronizada) — "lo que hago cada día"
// { id, programaId, fecha: 'YYYY-MM-DD', duracionMin: number | null,
//   tipo: clave de ENTRY_TYPES, texto, etiquetas: string[], enlace: '' | url,
//   participantes: number | null   (alumnado o docentes implicados, opcional) }
//
// Los eventos del calendario pueden llevar `programaId` (reuniones, actividades del programa).

import { store } from './store.js';
import { todayISO } from './ui.js';
import { currentSchoolYear } from './school.js';

export const PROGRAM_TYPES = {
  programa: 'Programa',
  plan: 'Plan',
  proyecto: 'Proyecto',
};

export const ROLES = { coordinador: 'Coordinación', participante: 'Participante' };

export const ENTRY_TYPES = {
  actuacion: { label: 'Actuación con alumnado', color: 't3' },
  reunion: { label: 'Reunión', color: 't2' },
  formacion: { label: 'Formación', color: 't4' },
  gestion: { label: 'Gestión y documentación', color: 't5' },
  difusion: { label: 'Difusión', color: 't6' },
  otro: { label: 'Otro', color: 't1' },
};

/** "STEAM 4.0" → "steam-4-0" (para la etiqueta de tareas). */
export function slugTag(nombre) {
  return String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'programa';
}

export function createProgram(fields = {}) {
  return store.add('programas', {
    nombre: '', tipo: 'programa', rol: 'coordinador', cursoEscolar: currentSchoolYear(),
    descripcion: '', color: 't3', objetivos: [], equipo: [], enlaces: [], archivado: false,
    ...fields,
    etiqueta: fields.etiqueta || slugTag(fields.nombre),
  });
}

export const getPrograms = ({ includeArchived = false } = {}) =>
  store.list('programas').filter((p) => includeArchived || !p.archivado)
    .sort((a, b) => (b.cursoEscolar || '').localeCompare(a.cursoEscolar || '') || a.nombre.localeCompare(b.nombre, 'es'));

export function addEntry(programaId, fields = {}) {
  return store.add('diarioPrograma', {
    programaId, fecha: todayISO(), duracionMin: null, tipo: 'actuacion', texto: '', etiquetas: [], enlace: '', participantes: null,
    ...fields, texto: String(fields.texto || '').trim(),
  });
}

/** Entradas del diario de un programa (más recientes primero), con filtros opcionales. */
export function listEntries(programaId, { from, to, tipo } = {}) {
  return store.list('diarioPrograma')
    .filter((e) => e.programaId === programaId && (!tipo || e.tipo === tipo) && (!from || e.fecha >= from) && (!to || e.fecha <= to))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.createdAt || 0) - (a.createdAt || 0));
}

/** Tareas vinculadas: las que llevan la etiqueta del programa. */
export const programTasks = (p) => store.list('tasks').filter((t) => (t.tags || []).includes(p.etiqueta));
/** Eventos vinculados al programa. */
export const programEvents = (p) => store.list('events').filter((e) => e.programaId === p.id)
  .sort((a, b) => a.fecha.localeCompare(b.fecha));

/** Resumen para la tarjeta y la memoria: { entradas, minutos, porTipo:{tipo:{n,min}}, porMes:{'2026-10':n}, objetivos:{hechos,total}, ultima } */
export function programStats(programaId, opts = {}) {
  const entries = listEntries(programaId, opts);
  const porTipo = {}; const porMes = {};
  let minutos = 0;
  for (const e of entries) {
    const t = (porTipo[e.tipo] ||= { n: 0, min: 0 });
    t.n++; t.min += e.duracionMin || 0; minutos += e.duracionMin || 0;
    const m = e.fecha.slice(0, 7); porMes[m] = (porMes[m] || 0) + 1;
  }
  const p = store.get('programas', programaId);
  const objs = p?.objetivos || [];
  return {
    entradas: entries.length, minutos, porTipo, porMes,
    objetivos: { hechos: objs.filter((o) => o.hecho).length, total: objs.length },
    ultima: entries[0]?.fecha || null,
  };
}

export const fmtDuration = (min) => {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};

/**
 * Texto de la memoria del programa (Markdown sencillo), listo para copiar en Séneca
 * o descargar. Incluye objetivos, actuaciones por tipo con fechas, reuniones y equipo.
 */
export function buildMemoria(programaId, { from, to } = {}) {
  const p = store.get('programas', programaId);
  if (!p) return '';
  const st = programStats(programaId, { from, to });
  const entries = listEntries(programaId, { from, to }).reverse();
  const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const L = [];
  L.push(`# Memoria · ${p.nombre}`, '');
  L.push(`${PROGRAM_TYPES[p.tipo] || 'Programa'} · Curso ${p.cursoEscolar} · ${ROLES[p.rol] || ''}`);
  if (from || to) L.push(`Periodo: ${from ? fmtDate(from) : 'inicio'} – ${to ? fmtDate(to) : 'hoy'}`);
  L.push('');
  if (p.descripcion) L.push('## Descripción', '', p.descripcion, '');
  if (p.objetivos?.length) {
    L.push('## Objetivos', '');
    p.objetivos.forEach((o) => L.push(`- ${o.hecho ? '[x]' : '[ ]'} ${o.texto}`));
    L.push('', `Conseguidos: ${st.objetivos.hechos} de ${st.objetivos.total}.`, '');
  }
  L.push('## Resumen de actuaciones', '');
  L.push(`- Registros en el diario: ${st.entradas}`);
  if (st.minutos) L.push(`- Tiempo dedicado: ${fmtDuration(st.minutos)}`);
  Object.entries(st.porTipo).forEach(([t, v]) => L.push(`- ${ENTRY_TYPES[t]?.label || t}: ${v.n}${v.min ? ` (${fmtDuration(v.min)})` : ''}`));
  L.push('');
  for (const [t, def] of Object.entries(ENTRY_TYPES)) {
    const list = entries.filter((e) => e.tipo === t);
    if (!list.length) continue;
    L.push(`## ${def.label}`, '');
    list.forEach((e) => L.push(`- ${fmtDate(e.fecha)}${e.duracionMin ? ` (${fmtDuration(e.duracionMin)})` : ''}: ${e.texto || '—'}${e.enlace ? ` — ${e.enlace}` : ''}`));
    L.push('');
  }
  if (p.equipo?.length) {
    L.push('## Equipo', '');
    p.equipo.forEach((m) => L.push(`- ${m.nombre}${m.rol ? ` (${m.rol})` : ''}`));
    L.push('');
  }
  return L.join('\n');
}
