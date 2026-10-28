// Tabula · dictado por voz: lógica pura (sin DOM), probada con Node.
// Convierte lo dictado («Lucía ha ayudado hoy a un compañero. Mañana claustro a las 5») en apuntes
// con la misma forma que los del asistente ({ tipo, datos }), que después revisa el docente en la bandeja.
// Todo ocurre en el dispositivo: aquí sí se usan los nombres completos del alumnado.

import { parseQuickInput } from './tasks-model.js';
import { normalizeItem } from './asistente-model.js';

/** Minúsculas y sin acentos. */
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s) => fold(s).split(/[^a-z0-9ñ]+/).filter(Boolean);
const has = (t, re) => re.test(fold(t));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const TAREA_INI = /^(?:apunta(?:me)?|anota(?:me)?|recuerdame|recordar|tengo que|hay que|tarea|pendiente|no olvidar|no te olvides de|acuerdate de)\b/;
const TAREA_VERBO = /^(?:llamar|enviar|mandar|preparar|corregir|imprimir|hacer|revisar|comprar|escribir|subir|pedir|entregar|rellenar|preguntar|avisar|hablar con|terminar|buscar|traer|poner|organizar)\b/;
const REUNION = /\b(?:tutoria|reunion|entrevista|cita|he hablado|hemos hablado|ha venido|han venido|llamada)\b/;
const FAMILIA = /\b(?:familia|madre|padre|padres|abuela|abuelo|tutora? legal|mama|papa)\b/;
const EVENTO = /\b(?:evento|claustro|excursion|salida|reunion|consejo escolar|ciclo|etcp|evaluacion|formacion|jornada|fiesta|festival|cita|medico|visita|charla|taller|guardia|equipo docente|actuacion|funcion|simulacro)\b/;
const POSITIVA = /\b(?:bien|genial|muy bien|estupendo|excelente|fenomenal|ayudado|ayuda|mejorado|mejora|participa|participado|esfuerzo|se ha esforzado|felicitar|ha trabajado|atento|atenta|bonito|positivo|generoso|generosa|amable)\b/;
const NEGATIVA = /\b(?:mal|no ha traido|no trae|no ha hecho|no hace|pegado|pega|molesta|molestado|insultado|insulta|distraido|distraida|olvidado|olvida|peleado|pelea|regaño|regañar|grita|gritado|negativo|llegado tarde|llega tarde|sin deberes|no atiende|desobedece|faltado al respeto|roto)\b/;
const OBS_INI = /^(?:observacion(?:es)?|anecdota|nota)(?:\s+(?:de|para|sobre))?\b[\s:,]*/;
const QUITAR_INI = /^(?:apunta(?:me)?|anota(?:me)?|recuerdame|recordar|tarea|pendiente|evento|observacion|tutoria|y|tambien|ademas)\b[\s:,]*(?:que\s+)?/;

/** Parte el dictado en frases (puntos, «otra cosa», «además», saltos de línea). */
export function splitDictation(text) {
  return String(text || '')
    .replace(/\s+(?:y\s+)?(?:otra cosa|ademas|además|también apunta|tambien apunta|por otro lado|luego)[,:]?\s+/gi, '. ')
    .split(/[.!?;\n]+/)
    .map((s) => s.trim().replace(/^[,:-]+\s*/, ''))
    .filter((s) => s.length > 2);
}

/** Quita la muletilla inicial («apúntame que…», «tarea:») manteniendo el resto tal cual. */
function stripLead(seg) {
  let s = seg;
  for (let i = 0; i < 3; i++) {
    const m = fold(s).match(QUITAR_INI);
    if (!m || !m[0]) break;
    s = s.slice(m[0].length);
  }
  return s.trim();
}

/**
 * Alumnado nombrado en una frase. Busca el nombre (y, si se dice, el primer apellido) como palabras.
 * @param students [{ id, nombre, apellidos, groupId }]
 * @returns { ids: [id], ambiguos: [texto] }   ambiguos = nombres que coinciden con varios alumnos
 */
export function findStudents(seg, students) {
  const w = words(seg);
  const at = (seq) => { for (let i = 0; i + seq.length <= w.length; i++) if (seq.every((x, j) => w[i + j] === x)) return i; return -1; };
  const byName = new Map();   // «lucia» → [{ s, strong }]
  for (const s of students) {
    const n = words(s.nombre);
    if (!n.length) continue;
    const i = at(n);
    if (i < 0) continue;
    const ap = words(s.apellidos)[0];
    const strong = !!ap && w[i + n.length] === ap;
    const k = n.join(' ');
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push({ s, strong });
  }
  // «María José» contiene «José»: si un nombre está dentro de otro encontrado, manda el más largo
  const keys = [...byName.keys()];
  const ids = [], ambiguos = [];
  for (const k of keys) {
    if (keys.some((o) => o !== k && o.length > k.length && ` ${o} `.includes(` ${k} `))) continue;
    const c = byName.get(k);
    const strong = c.filter((x) => x.strong);
    const pick = strong.length ? strong : c;
    if (pick.length === 1) ids.push(pick[0].s.id);
    else ambiguos.push(cap(k));
  }
  return { ids, ambiguos };
}

/** Decide el tipo de una frase. */
export function classify(seg, found) {
  const f = fold(seg).trim();
  const named = found.ids.length + found.ambiguos.length > 0;
  if (/^tarea\b/.test(f)) return 'tarea';
  if (/^evento\b/.test(f)) return 'evento';
  if (/^(?:tutoria|reunion con (?:la |el |los )?(?:familia|madre|padre|padres))\b/.test(f)) return 'reunion';
  if (OBS_INI.test(f)) return 'observacion';
  if (named && REUNION.test(f) && (FAMILIA.test(f) || /\b(?:tutoria|entrevista)\b/.test(f))) return 'reunion';
  const rest = fold(stripLead(seg));
  if (TAREA_INI.test(f) || TAREA_VERBO.test(rest)) return 'tarea';
  if (named) return 'observacion';
  const p = parseQuickInput(seg);
  if (p.due && (p.time || EVENTO.test(f))) return 'evento';
  return 'tarea';
}

/**
 * Interpreta un dictado completo.
 * @param ctx { students: [{ id, nombre, apellidos, groupId }], today: 'YYYY-MM-DD', now?: Date }
 * @returns [{ tipo, datos, dudas }]   ya normalizados (normalizeItem), listos para la bandeja
 */
export function interpretDictation(text, { students, today, now = new Date() }) {
  const map = new Map(students.map((s) => [s.id, s]));
  const ctx = { students: map, today };
  const out = [];
  const push = (tipo, datos) => { const r = normalizeItem(tipo, datos, ctx); if (r.ok) out.push({ tipo: r.tipo, datos: r.datos, dudas: r.dudas }); };

  for (const seg of splitDictation(text)) {
    const found = findStudents(seg, students);
    const tipo = classify(seg, found);
    const obs = fold(seg).match(OBS_INI);
    // «Observación de José: se distrae» → «Se distrae» (el alumno ya queda asignado)
    const body = stripLead(obs ? seg.slice(obs[0].length).replace(/^[^:]{1,40}:\s*/, '') : seg);
    const p = parseQuickInput(body, now);
    // En un colegio, «a las 5» es por la tarde: de 1 a 7 sin «de la mañana» se pasa a 13–19 h
    if (p.time && +p.time.slice(0, 2) >= 1 && +p.time.slice(0, 2) <= 7 && !has(seg, /\b(?:de la manana|de la madrugada)\b/)) p.time = `${+p.time.slice(0, 2) + 12}${p.time.slice(2)}`;
    const alumnoTexto = found.ambiguos.join(', ');

    if (tipo === 'tarea') push('tarea', { titulo: cap(p.title), fecha: p.due, hora: p.time });
    else if (tipo === 'evento') push('evento', { titulo: cap(p.title.replace(/^evento\s*:?\s*/i, '')), fecha: p.due, hora: p.time });
    else if (tipo === 'reunion') {
      const pasada = has(seg, /\b(?:he hablado|hemos hablado|ha venido|han venido|hablamos|vino)\b/) || (p.due && p.due <= today);
      push('reunion', {
        studentIds: found.ids, alumnoTexto, fecha: p.due || today, hora: p.time,
        modalidad: has(seg, /\b(?:telefono|llamada|ha llamado|por telefono)\b/) ? 'telefono' : has(seg, /\b(?:video|videollamada|meet|zoom)\b/) ? 'video' : 'presencial',
        motivo: pasada ? '' : cap(body), resumen: pasada ? cap(body) : '',
      });
    } else {
      const tipoObs = NEGATIVA.test(fold(body)) ? 'negativa' : POSITIVA.test(fold(body)) ? 'positiva' : 'neutra';
      const texto = cap(body);
      const fecha = p.due && p.due <= today ? p.due : today;
      // «Pablo y Lucía han trabajado muy bien»: una observación para cada uno
      if (found.ids.length) found.ids.forEach((id) => push('observacion', { studentId: id, alumnoTexto: '', tipo: tipoObs, texto, fecha }));
      if (found.ambiguos.length || !found.ids.length) push('observacion', { studentId: null, alumnoTexto, tipo: tipoObs, texto, fecha });
    }
  }
  return out;
}
