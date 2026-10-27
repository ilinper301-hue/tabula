// Tabula · anecdotario: observaciones rápidas del alumnado (lógica pura + consultas).
//
// COLECCIÓN 'observaciones' (sincronizada)
// { id, studentId, groupId, fecha:'YYYY-MM-DD', hora:'HH:MM',
//   tipo: 'positiva' | 'negativa' | 'neutra',
//   etiqueta: string | null      (una de las etiquetas rápidas, p. ej. 'Participa'),
//   texto: string                (nota libre, opcional),
//   area: string | null          (área en la que ocurrió, si se sabe),
//   sesionId: string | null      (sesión de Planificación, si se registró desde ella) }
//
// AJUSTE 'obsEtiquetas': { positiva: string[], negativa: string[], neutra: string[] }
// Las observaciones NO cambian la nota automáticamente: el docente las ve en el cuaderno y en la
// ficha del alumno, y decide (p. ej. con el ajuste manual o con una actividad de "Observación").

import { store } from './store.js';
import { todayISO } from './ui.js';

export const OBS_TYPES = {
  positiva: { label: 'Positiva', sign: '+', color: 't3' },
  negativa: { label: 'A mejorar', sign: '−', color: 't1' },
  neutra: { label: 'Nota', sign: '·', color: 't2' },
};

export const DEFAULT_TAGS = {
  positiva: ['Participa', 'Ayuda a un compañero', 'Buen trabajo', 'Esfuerzo', 'Buena lectura', 'Comportamiento ejemplar'],
  negativa: ['No trae material', 'No hace la tarea', 'Interrumpe', 'Distraído', 'Conflicto con compañeros', 'Llega tarde'],
  neutra: ['Hablar con la familia', 'Revisar', 'Necesita apoyo', 'Ausente en la actividad'],
};

export const getTags = () => {
  const saved = store.getSetting('obsEtiquetas', null);
  return {
    positiva: saved?.positiva?.length ? saved.positiva : DEFAULT_TAGS.positiva,
    negativa: saved?.negativa?.length ? saved.negativa : DEFAULT_TAGS.negativa,
    neutra: saved?.neutra?.length ? saved.neutra : DEFAULT_TAGS.neutra,
  };
};
export const setTags = (tags) => store.setSetting('obsEtiquetas', tags);

const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** Registra una observación. Devuelve el documento creado. */
export function addObservation({ studentId, groupId, tipo = 'neutra', etiqueta = null, texto = '', area = null, sesionId = null, fecha = todayISO(), hora = nowHHMM() }) {
  if (!studentId || !OBS_TYPES[tipo]) throw new Error('Observación no válida');
  return store.add('observaciones', { studentId, groupId, fecha, hora, tipo, etiqueta, texto: texto.trim(), area, sesionId });
}

/** Observaciones filtradas y ordenadas (más recientes primero). */
export function listObservations({ studentId, groupId, area, from, to, tipo } = {}) {
  return store.list('observaciones')
    .filter((o) => (!studentId || o.studentId === studentId) && (!groupId || o.groupId === groupId)
      && (!area || o.area === area) && (!tipo || o.tipo === tipo)
      && (!from || o.fecha >= from) && (!to || o.fecha <= to))
    .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora) || (b.createdAt || 0) - (a.createdAt || 0));
}

/** Recuento por tipo: { positiva, negativa, neutra, total }. Acepta una lista ya filtrada. */
export function tally(list) {
  const t = { positiva: 0, negativa: 0, neutra: 0, total: 0 };
  for (const o of list) { if (t[o.tipo] !== undefined) t[o.tipo]++; t.total++; }
  return t;
}

/** Recuento por alumno para un grupo: { [studentId]: tally } */
export function tallyByStudent(groupId, opts = {}) {
  const out = {};
  for (const o of listObservations({ groupId, ...opts })) {
    const t = (out[o.studentId] ||= { positiva: 0, negativa: 0, neutra: 0, total: 0 });
    t[o.tipo]++; t.total++;
  }
  return out;
}

/** Etiquetas más usadas por un docente (para ordenar los botones rápidos). */
export function topTags(tipo, limit = 6) {
  const counts = new Map();
  for (const o of store.list('observaciones')) if (o.tipo === tipo && o.etiqueta) counts.set(o.etiqueta, (counts.get(o.etiqueta) || 0) + 1);
  const base = getTags()[tipo];
  return [...base].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)).slice(0, limit);
}

/** Rango de fechas de una evaluación del curso que empieza en septiembre de `startYear`. */
export function evaluationRange(ev, startYear) {
  if (ev === '1') return { from: `${startYear}-09-01`, to: `${startYear}-12-31` };
  if (ev === '2') return { from: `${startYear + 1}-01-01`, to: `${startYear + 1}-03-31` };
  if (ev === '3') return { from: `${startYear + 1}-04-01`, to: `${startYear + 1}-08-31` };
  return { from: `${startYear}-09-01`, to: `${startYear + 1}-08-31` };
}
