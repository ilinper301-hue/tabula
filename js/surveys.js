// Tabula · encuestas para compañeros (modelo, publicación y recepción de respuestas)
//
// LOCAL (sincronizado con la cuenta del docente)
// 'encuestas' { id, titulo, descripcion, preguntas: Pregunta[], pedirNombre: 'no' | 'opcional' | 'obligatorio',
//               mensajeFinal, programaId: string | null, estado: 'borrador' | 'abierta' | 'cerrada',
//               publicId: string | null (identificador aleatorio del enlace), publicadaAt: number | null }
// Pregunta { id, tipo: clave de QUESTION_TYPES, texto, ayuda: '', obligatoria: boolean,
//            opciones: string[] (unica / multiple), escala: { min, max, etiquetaMin, etiquetaMax } (escala) }
// 'encuestaRespuestas' { id: `${encuestaId}_${rid}`, encuestaId, rid, nombre: string | null,
//                        answers: { [preguntaId]: valor }, enviadaAt: number }   (copia local de lo recibido)
//
// NUBE (Firestore; ver firestore.rules)
//   apps/tabula/surveys/{publicId}                 definición pública (solo lectura para quien tiene el enlace)
//   apps/tabula/surveys/{publicId}/responses/{rid} una respuesta por persona (rid = uid anónimo del navegador)
//
// Quien responde no necesita cuenta: la página encuesta.html inicia una sesión anónima de Firebase.

import { store } from './store.js';
import { cloud, onSyncChange } from './sync.js';

export const QUESTION_TYPES = {
  corta: { label: 'Respuesta corta' },
  larga: { label: 'Párrafo' },
  unica: { label: 'Opción única' },
  multiple: { label: 'Varias opciones' },
  escala: { label: 'Escala' },
  sino: { label: 'Sí / No' },
  fecha: { label: 'Fecha' },
};

export const NAME_MODES = { no: 'Anónima', opcional: 'Nombre opcional', obligatorio: 'Pedir nombre' };

const rid = (n = 8) => {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => abc[b % abc.length]).join('');
};

export function newQuestion(tipo = 'unica') {
  const q = { id: rid(6), tipo, texto: '', ayuda: '', obligatoria: false, opciones: [], escala: null };
  if (tipo === 'unica' || tipo === 'multiple') q.opciones = ['Opción 1', 'Opción 2'];
  if (tipo === 'escala') q.escala = { min: 1, max: 5, etiquetaMin: 'Nada', etiquetaMax: 'Mucho' };
  return q;
}

export function createSurvey(fields = {}) {
  return store.add('encuestas', {
    titulo: '', descripcion: '', preguntas: [newQuestion('unica')], pedirNombre: 'no',
    mensajeFinal: '¡Gracias por responder!', programaId: null, estado: 'borrador', publicId: null, publicadaAt: null,
    ...fields,
  });
}

/** Errores que impiden publicar (lista de textos; vacía = se puede publicar). */
export function validateSurvey(s) {
  const err = [];
  if (!s.titulo?.trim()) err.push('Ponle un título a la encuesta.');
  if (!s.preguntas?.length) err.push('Añade al menos una pregunta.');
  (s.preguntas || []).forEach((q, i) => {
    if (!q.texto?.trim()) err.push(`La pregunta ${i + 1} no tiene enunciado.`);
    if ((q.tipo === 'unica' || q.tipo === 'multiple') && (q.opciones || []).filter((o) => o.trim()).length < 2) err.push(`La pregunta ${i + 1} necesita al menos dos opciones.`);
    if (q.tipo === 'escala' && !(q.escala && q.escala.max > q.escala.min && q.escala.max - q.escala.min <= 10)) err.push(`La escala de la pregunta ${i + 1} no es válida.`);
  });
  return err;
}

/** Lo que se publica: solo lo necesario para responder. */
function publicPayload(s, ownerUid) {
  const profile = store.getSetting('profile', {}) || {};
  return {
    ownerUid, version: 2,
    titulo: s.titulo.trim(), descripcion: (s.descripcion || '').trim(),
    autor: [profile.nombre, profile.centro].filter(Boolean).join(' · '),
    pedirNombre: s.pedirNombre || 'no', mensajeFinal: s.mensajeFinal || '',
    preguntas: s.preguntas.map((q) => ({
      id: q.id, tipo: q.tipo, texto: q.texto.trim(), ayuda: (q.ayuda || '').trim(), obligatoria: !!q.obligatoria,
      opciones: (q.opciones || []).map((o) => o.trim()).filter(Boolean), escala: q.escala || null,
    })),
    estado: s.estado === 'cerrada' ? 'cerrada' : 'abierta',
    updatedAt: Date.now(),
  };
}

export const canPublish = () => !!cloud();
export const NEED_CLOUD = 'Para compartir encuestas necesitas iniciar sesión con Google en Ajustes → Cuenta y sincronización.';

const surveyRef = (c, publicId) => c.fb.fs.doc(c.db, 'apps', 'tabula', 'surveys', publicId);
const responsesRef = (c, publicId) => c.fb.fs.collection(c.db, 'apps', 'tabula', 'surveys', publicId, 'responses');

/** Publica (o actualiza) la encuesta y la deja abierta. Devuelve el enlace. */
export async function publishSurvey(id) {
  const c = cloud();
  if (!c) throw new Error(NEED_CLOUD);
  const s = store.get('encuestas', id);
  const errors = validateSurvey(s);
  if (errors.length) throw new Error(errors[0]);
  const publicId = s.publicId || rid(20);
  // Al actualizar una encuesta ya cerrada, sigue cerrada; si es borrador o abierta, queda abierta
  const estado = s.publicId && s.estado === 'cerrada' ? 'cerrada' : 'abierta';
  await c.fb.fs.setDoc(surveyRef(c, publicId), publicPayload({ ...s, estado }, c.uid));
  store.update('encuestas', id, { publicId, estado, publicadaAt: s.publicadaAt || Date.now() });
  watchSurvey(store.get('encuestas', id));
  return surveyLink(store.get('encuestas', id));
}

/** Cierra (no admite más respuestas) o reabre una encuesta publicada. */
export async function setSurveyOpen(id, open) {
  const c = cloud();
  if (!c) throw new Error(NEED_CLOUD);
  const s = store.get('encuestas', id);
  if (!s?.publicId) throw new Error('La encuesta no está publicada.');
  await c.fb.fs.setDoc(surveyRef(c, s.publicId), { estado: open ? 'abierta' : 'cerrada', updatedAt: Date.now() }, { merge: true });
  store.update('encuestas', id, { estado: open ? 'abierta' : 'cerrada' });
}

/** Borra la encuesta, su enlace y todas sus respuestas (en la nube y en el dispositivo). */
export async function deleteSurvey(id) {
  const s = store.get('encuestas', id);
  if (!s) return;
  if (s.publicId) {
    const c = cloud();
    if (!c) throw new Error('Para borrar una encuesta publicada necesitas tener la sesión iniciada.');
    unwatch(id);
    const snap = await c.fb.fs.getDocs(responsesRef(c, s.publicId));
    await Promise.all(snap.docs.map((d) => c.fb.fs.deleteDoc(c.fb.fs.doc(c.db, 'apps', 'tabula', 'surveys', s.publicId, 'responses', d.id))));
    await c.fb.fs.deleteDoc(surveyRef(c, s.publicId));
  }
  getResponses(id).forEach((r) => store.remove('encuestaRespuestas', r.id));
  store.remove('encuestas', id);
}

/** Borra una respuesta concreta (p. ej. una de prueba). */
export async function deleteResponse(surveyId, localId) {
  const s = store.get('encuestas', surveyId);
  const r = store.get('encuestaRespuestas', localId);
  if (!s || !r) return;
  const c = cloud();
  if (s.publicId && c) await c.fb.fs.deleteDoc(c.fb.fs.doc(c.db, 'apps', 'tabula', 'surveys', s.publicId, 'responses', r.rid));
  store.remove('encuestaRespuestas', localId);
}

/** Enlace para compartir (la página pública vive junto a la app). */
export function surveyLink(s) {
  if (!s?.publicId) return '';
  const url = new URL('encuesta.html', location.href);
  url.search = ''; url.hash = s.publicId;
  return url.toString();
}

export const getResponses = (surveyId) => store.list('encuestaRespuestas')
  .filter((r) => r.encuestaId === surveyId).sort((a, b) => (a.enviadaAt || 0) - (b.enviadaAt || 0));

// ---------- Recepción en tiempo real ----------
const watchers = new Map(); // encuestaId -> unsubscribe
const newListeners = new Set();
/** Aviso al llegar una respuesta nueva: fn({ encuesta, respuesta }) */
export const onNewResponse = (fn) => { newListeners.add(fn); return () => newListeners.delete(fn); };

function unwatch(id) { const u = watchers.get(id); if (u) { u(); watchers.delete(id); } }

function watchSurvey(s) {
  const c = cloud();
  if (!c || !s?.publicId || watchers.has(s.id)) return;
  let first = true;
  const unsub = c.fb.fs.onSnapshot(responsesRef(c, s.publicId), (snap) => {
    const remoteIds = new Set();
    for (const d of snap.docs) {
      const data = d.data();
      const localId = `${s.id}_${d.id}`;
      remoteIds.add(localId);
      const enviadaAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : (typeof data.createdAt === 'number' ? data.createdAt : Date.now());
      const doc = { id: localId, encuestaId: s.id, rid: d.id, nombre: data.nombre ?? null, answers: data.answers || {}, enviadaAt, createdAt: enviadaAt, updatedAt: enviadaAt };
      const prev = store.get('encuestaRespuestas', localId);
      if (!prev || JSON.stringify(prev.answers) !== JSON.stringify(doc.answers) || prev.nombre !== doc.nombre) {
        store.restore('encuestaRespuestas', doc); // inserta o sustituye con el mismo id
        if (!prev && !first) newListeners.forEach((fn) => { try { fn({ encuesta: s, respuesta: doc }); } catch {} });
      }
    }
    // Respuestas borradas en la nube
    getResponses(s.id).forEach((r) => { if (!remoteIds.has(r.id)) store.remove('encuestaRespuestas', r.id); });
    first = false;
  }, () => { unwatch(s.id); });
  watchers.set(s.id, unsub);
}

function refreshWatchers() {
  if (!cloud()) { [...watchers.keys()].forEach(unwatch); return; }
  const surveys = store.list('encuestas').filter((s) => s.publicId);
  const ids = new Set(surveys.map((s) => s.id));
  [...watchers.keys()].forEach((id) => { if (!ids.has(id)) unwatch(id); });
  surveys.forEach(watchSurvey);
}

/** Arranca la recepción de respuestas (llamar una vez al iniciar la app). */
export function initSurveys() {
  onSyncChange(refreshWatchers);
  store.subscribe('encuestas', () => { if (!store._fromRemote) refreshWatchers(); else setTimeout(refreshWatchers, 0); });
  refreshWatchers();
}

// ---------- Resultados ----------
/**
 * Resumen por pregunta:
 *  unica/multiple/sino → { tipo, total, counts: [{ label, n }] }
 *  escala              → { tipo, total, media, counts: [{ label: '1', n }, …] }
 *  corta/larga/fecha   → { tipo, total, textos: [{ texto, nombre }] }
 */
export function summarize(s, responses) {
  return (s.preguntas || []).map((q) => {
    const vals = responses.map((r) => ({ v: r.answers?.[q.id], nombre: r.nombre })).filter((x) => x.v !== undefined && x.v !== null && x.v !== '' && !(Array.isArray(x.v) && !x.v.length));
    const base = { pregunta: q, total: vals.length };
    if (q.tipo === 'unica' || q.tipo === 'multiple' || q.tipo === 'sino') {
      const labels = q.tipo === 'sino' ? ['Sí', 'No'] : [...(q.opciones || [])];
      const counts = new Map(labels.map((l) => [l, 0]));
      for (const { v } of vals) for (const x of (Array.isArray(v) ? v : [v])) counts.set(String(x), (counts.get(String(x)) || 0) + 1);
      return { ...base, counts: [...counts].map(([label, n]) => ({ label, n })) };
    }
    if (q.tipo === 'escala') {
      const { min = 1, max = 5 } = q.escala || {};
      const counts = []; for (let i = min; i <= max; i++) counts.push({ label: String(i), n: 0 });
      let sum = 0;
      for (const { v } of vals) { const n = Number(v); const c = counts.find((x) => Number(x.label) === n); if (c) { c.n++; sum += n; } }
      return { ...base, counts, media: vals.length ? Math.round((sum / vals.length) * 10) / 10 : null };
    }
    return { ...base, textos: vals.map(({ v, nombre }) => ({ texto: String(v), nombre })) };
  });
}

/** CSV (separador ';', con BOM, para Excel en español). */
export function toCSV(s, responses) {
  const esc = (v) => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t)) t = `'${t}`; return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = ['Fecha', ...(s.pedirNombre !== 'no' ? ['Nombre'] : []), ...s.preguntas.map((q) => q.texto)];
  const rows = responses.map((r) => [
    new Date(r.enviadaAt).toLocaleString('es-ES'),
    ...(s.pedirNombre !== 'no' ? [r.nombre || ''] : []),
    ...s.preguntas.map((q) => { const v = r.answers?.[q.id]; return Array.isArray(v) ? v.join(' | ') : (v ?? ''); }),
  ]);
  return '﻿' + [head, ...rows].map((row) => row.map(esc).join(';')).join('\r\n');
}
