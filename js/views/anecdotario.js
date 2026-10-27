// Tabula · Anecdotario (observaciones rápidas del alumnado).
//
//   import { openQuickObservation, renderStudentObservations } from './anecdotario.js';
//   openQuickObservation({ groupId, studentIds?, area?, sesionId? })   hoja de registro rápido
//   renderStudentObservations(container, studentId)                    lista del alumno (devuelve limpieza)
//
// Sin efectos al importar. Estilos: css/anecdotario.css. Datos y consultas: js/observations.js.
export { openQuickObservation } from './anecdotario/quick.js';
export { renderStudentObservations, openStudentObservations } from './anecdotario/list.js';
export { mountObservaciones } from './anecdotario/group-tab.js';
