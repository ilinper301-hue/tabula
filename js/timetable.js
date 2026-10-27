// Tabula · generación de franjas horarias (lógica compartida por Calendario y el asistente de primer uso).
// Ajuste 'horarioFranjas': [{inicio:'HH:MM', fin:'HH:MM', tipo:'clase'|'recreo'|'otro'}].

import { store } from './store.js';

const pad = (n) => String(n).padStart(2, '0');
/** "HH:MM" a partir de minutos desde medianoche. */
export const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/**
 * Calcula las franjas de una jornada: sesiones consecutivas con un recreo opcional.
 * @param {{inicio?:string, duracion?:number, sesiones?:number, recreoTras?:number, recreoDuracion?:number}} opts
 *   recreoTras: recreo tras la sesión nº (0 = sin recreo).
 * @returns {{inicio:string, fin:string, tipo:'clase'|'recreo'}[]}
 * @throws {Error} con mensaje en español si los datos no son válidos o el horario pasa de medianoche.
 */
export function buildFranjas({ inicio = '09:00', duracion = 60, sesiones = 5, recreoTras = 3, recreoDuracion = 30 } = {}) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(inicio || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('Indica la hora de inicio y el número de sesiones.');
  const len = Number(duracion), n = Number(sesiones), after = Number(recreoTras) || 0, rlen = Number(recreoDuracion);
  if (!Number.isInteger(len) || len < 1) throw new Error('La duración de cada sesión no es válida.');
  if (!Number.isInteger(n) || n < 1) throw new Error('Indica la hora de inicio y el número de sesiones.');
  if (after > 0 && after <= n && (!Number.isInteger(rlen) || rlen < 1)) throw new Error('La duración del recreo no es válida.');

  let t = Number(m[1]) * 60 + Number(m[2]);
  const franjas = [];
  for (let i = 1; i <= n; i++) {
    franjas.push({ inicio: fmtMin(t), fin: fmtMin(t + len), tipo: 'clase' }); t += len;
    if (after === i) { franjas.push({ inicio: fmtMin(t), fin: fmtMin(t + rlen), tipo: 'recreo' }); t += rlen; }
  }
  if (t >= 24 * 60) throw new Error('El horario se pasa de medianoche; reduce las sesiones.');
  return franjas;
}

/**
 * Crea las sesiones de una franja que no es clase (recreo u otra) en los cinco días, sin duplicar.
 * Las franjas de clase no crean nada: se rellenan a mano con área y grupo.
 * @returns {object[]} sesiones creadas
 */
export function fillFranja(f) {
  const created = [];
  if (f.tipo === 'clase') return created;
  const all = store.list('schedule');
  for (let dia = 1; dia <= 5; dia++) {
    if (all.some((x) => x.dia === dia && x.inicio === f.inicio && x.fin === f.fin)) continue;
    created.push(store.add('schedule', {
      dia, inicio: f.inicio, fin: f.fin, tipo: f.tipo, area: '', groupId: null,
      titulo: f.tipo === 'recreo' ? 'Recreo' : '', aula: '',
    }));
  }
  return created;
}

/**
 * Guarda las franjas como ajuste 'horarioFranjas' y crea los recreos de cada día.
 * @returns {object[]} sesiones de recreo creadas
 */
export function applyFranjas(franjas) {
  store.setSetting('horarioFranjas', franjas);
  return franjas.flatMap(fillFranja);
}
