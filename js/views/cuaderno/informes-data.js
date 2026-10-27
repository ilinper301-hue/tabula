// Tabula · Cuaderno · Informes · datos del grupo (todos los cuadernos del curso) y utilidades comunes
import { store } from '../../store.js';
import { getStudents, getGroup, AREAS } from '../../school.js';
import { competenciaOf } from '../../grading.js';
import { ceDescriptorMap, competencyProfile, groupProfileMeans } from '../../competencias.js';
import { areasWithGradebook, loadContext, officialForGroup } from './model.js';
import { groupDocs, studentStats } from '../grupos/summary.js';

/**
 * Carga todo lo necesario para los informes de un grupo y una evaluación.
 * @returns { group, students, ev, areas:[{ area, ctx, ceMap, results }], profiles:{[sid]:perfil}, means, graded }
 */
export async function loadGroupData(groupId, ev) {
  const group = getGroup(groupId);
  const students = getStudents(groupId);
  const names = areasWithGradebook(groupId).filter((a, i, arr) => arr.indexOf(a) === i)
    .sort((a, b) => (AREAS.indexOf(a) + 1 || 99) - (AREAS.indexOf(b) + 1 || 99));
  const areas = [];
  for (const area of names) {
    const ctx = loadContext({ groupId, area, ev });
    if (!ctx.gb) continue;
    let ceMap = {};
    try { ceMap = ceDescriptorMap(await officialForGroup(groupId, area)); } catch { ceMap = {}; }
    areas.push({ area, ctx, ceMap, results: ctx.results });
  }
  const profiles = {};
  for (const s of students) {
    profiles[s.id] = competencyProfile(areas.map((a) => ({
      area: a.area, porCompetencia: a.results[s.id]?.porCompetencia || {}, ceMap: a.ceMap,
    })));
  }
  const means = groupProfileMeans(Object.values(profiles));
  const graded = students.some((s) => profiles[s.id].evaluadas > 0);
  return { group, students, ev, areas, profiles, means, graded };
}

/** Notas de un alumno por área: [{ area, nota }] (nota null si no hay). */
export const areaGrades = (data, studentId) =>
  data.areas.map((a) => ({ area: a.area, nota: a.results[studentId]?.nota ?? null }));

/** Resumen de asistencia del curso para un alumno (null si no hay días registrados). */
export function attendanceOf(group, studentId) {
  if (!group) return null;
  const st = studentStats(groupDocs(group), studentId);
  return st.dias ? st : null;
}

// ---------- Comentarios de los informes (colección «informes», sincronizada) ----------
export const getReport = (groupId, studentId, ev) =>
  store.list('informes').find((r) => r.groupId === groupId && r.studentId === studentId && r.ev === ev) || null;

export function saveReport(groupId, studentId, ev, comentario) {
  const prev = getReport(groupId, studentId, ev);
  const text = String(comentario || '').trim();
  if (prev) {
    if (!text) { store.remove('informes', prev.id); return null; }
    return store.update('informes', prev.id, { comentario: text });
  }
  return text ? store.add('informes', { groupId, studentId, ev, comentario: text }) : null;
}

/** Nombre de archivo: "1A" a partir de "1º A". */
export const groupSlug = (name) => String(name || 'grupo').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '').slice(0, 20) || 'grupo';

export const evSlug = (ev) => (ev === 'final' ? 'final' : `${ev}eval`);

export { competenciaOf };
