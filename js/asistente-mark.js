// Tabula · marca visible de lo que registró el asistente (chip «Asistente» con su detalle)
import { h, icon, MESES } from './ui.js';

const stamp = (ms, withTime) => {
  const d = new Date(ms);
  const day = `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
  return withTime ? `${day}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : day;
};

/** «Registrado por el asistente el 28 oct, 10:32 · aceptado el 28 oct» */
export function asistenteDetail(a) {
  if (!a) return '';
  const reg = a.registradoEn ? `Registrado por el asistente el ${stamp(a.registradoEn, true)}` : 'Registrado por el asistente';
  return a.aceptadoEn ? `${reg} · aceptado el ${stamp(a.aceptadoEn, false)}` : reg;
}

/** Chip discreto «Asistente» o null si el registro no viene del asistente. */
export function asistenteChip(rec) {
  if (!rec || !rec.asistente) return null;
  return h('span', { class: 'chip as-mark', title: asistenteDetail(rec.asistente) }, icon('sparkle', 12), 'Asistente');
}
