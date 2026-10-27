// Tabula · Encuestas · modelo del editor (funciones puras, sin DOM)
import { newQuestion } from '../../surveys.js';

export const clone = (x) => JSON.parse(JSON.stringify(x));

/** Campos editables de una encuesta (el resto —estado, enlace…— lo gestiona surveys.js). */
const DEFAULTS = { titulo: '', descripcion: '', preguntas: [], pedirNombre: 'no', mensajeFinal: '', programaId: null };
export const pickContent = (s) => Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, clone(s?.[k] ?? DEFAULTS[k])]));

/** JSON con claves ordenadas: compara contenido aunque la nube cambie el orden de las claves. */
export const canon = (x) => JSON.stringify(x, (_, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
export const sameContent = (a, b) => canon(pickContent(a)) === canon(pickContent(b));

/** Firma de lo que ven los compañeros: sirve para saber si hay cambios sin publicar. */
export function publicSig(s) {
  return canon({
    t: (s.titulo || '').trim(), d: (s.descripcion || '').trim(), n: s.pedirNombre || 'no', m: s.mensajeFinal || '',
    q: (s.preguntas || []).map((q) => ({
      id: q.id, tipo: q.tipo, texto: (q.texto || '').trim(), ayuda: (q.ayuda || '').trim(), obl: !!q.obligatoria,
      op: (q.opciones || []).map((o) => o.trim()).filter(Boolean), es: q.escala || null,
    })),
  });
}

// Al cambiar de tipo y volver, se recuperan las opciones/escala que había.
const stash = new Map();
export function changeType(q, tipo) {
  stash.set(q.id, { ...(stash.get(q.id) || {}), [q.tipo]: { opciones: q.opciones, escala: q.escala } });
  const back = stash.get(q.id)?.[tipo];
  const base = newQuestion(tipo);
  q.tipo = tipo;
  q.opciones = tipo === 'unica' || tipo === 'multiple' ? (back?.opciones?.length ? back.opciones : (q.opciones?.length ? q.opciones : base.opciones)) : [];
  q.escala = tipo === 'escala' ? (back?.escala || base.escala) : null;
}

export function duplicateQuestion(q) {
  return { ...clone(q), id: newQuestion().id };
}

/** Pestaña inicial: borradores a editar, publicadas a ver resultados. */
export const defaultTab = (s) => (s.publicId ? 'resultados' : 'editar');

/** Minutos aproximados para contestar (para el mensaje de invitación). */
export const minutesFor = (n) => Math.max(1, Math.ceil(n / 3));
