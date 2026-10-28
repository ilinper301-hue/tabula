// Tabula · Tutoría · acceso a datos: reuniones (con su evento de calendario) y medidas
import { store } from '../../store.js';
import { getStudents } from '../../school.js';
import { reunionEventTitle } from '../../tutoria.js';
import { byId } from './common.js';

export const getReuniones = (groupId) => store.list('reuniones').filter((r) => r.groupId === groupId);
export const getMedidas = (groupId) => store.list('medidas').filter((m) => m.groupId === groupId);

/** Alumnado de un grupo por id (incluye a quien ya no esté, si se pasa `extra`). */
const studentsOf = (groupId) => byId(getStudents(groupId));

/**
 * Mantiene el evento de calendario de una reunión: existe mientras esté prevista o realizada
 * (queda como registro en el calendario) y se elimina si se cancela.
 */
export function syncEvent(reunionId) {
  const r = store.get('reuniones', reunionId);
  if (!r) return;
  const existing = r.eventId ? store.get('events', r.eventId) : null;
  const wants = (r.estado === 'prevista' || r.estado === 'realizada') && r.fecha;
  if (wants) {
    const data = {
      titulo: reunionEventTitle(r, studentsOf(r.groupId)), fecha: r.fecha, fechaFin: null, hora: r.hora || null,
      tipo: r.tipo === 'familia' ? 'tutoria' : 'reunion', groupId: r.groupId, notas: r.motivo || '',
      origen: 'tutoria', reunionId: r.id, ...(r.asistente ? { asistente: r.asistente } : {}),
    };
    if (existing) store.update('events', existing.id, data);
    else {
      const ev = store.add('events', data);
      store.update('reuniones', r.id, { eventId: ev.id });
    }
  } else if (r.eventId) {
    if (existing) store.remove('events', r.eventId);
    store.update('reuniones', r.id, { eventId: null });
  }
}

/** Crea o actualiza una reunión y su evento. Devuelve la reunión guardada. */
export function saveReunion(data, id = null) {
  const saved = id ? store.update('reuniones', id, data) : store.add('reuniones', { acuerdos: [], eventId: null, ...data });
  syncEvent(saved.id);
  return store.get('reuniones', saved.id);
}

/** Elimina una reunión y su evento. Devuelve una función que lo deshace. */
export function deleteReunion(r) {
  const ev = r.eventId ? store.get('events', r.eventId) : null;
  const removed = store.remove('reuniones', r.id);
  if (ev) store.remove('events', ev.id);
  return () => { if (removed) store.restore('reuniones', removed); if (ev) store.restore('events', ev); };
}

/** Cambia el estado «hecho» de un acuerdo. */
export function toggleAgreement(reunionId, acuerdoId, hecho) {
  const r = store.get('reuniones', reunionId);
  if (!r) return;
  store.update('reuniones', reunionId, { acuerdos: (r.acuerdos || []).map((a) => (a.id === acuerdoId ? { ...a, hecho } : a)) });
}

export function deleteMedida(m) {
  const removed = store.remove('medidas', m.id);
  return () => { if (removed) store.restore('medidas', removed); };
}
