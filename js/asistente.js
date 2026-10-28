// Tabula · acceso de asistente (lado del docente).
// Activa/renueva/desactiva la llave, aprueba dispositivos, publica la lectura mínima y recoge el buzón
// hacia la bandeja local 'bandejaAsistente'. Todo con la cuenta de Google del docente (cloud()).
// Reglas: firestore.rules → bloque «acceso de asistente».

import { store } from './store.js';
import { cloud, onSyncChange } from './sync.js';
import { todayISO } from './ui.js';
import { newKey, normalizeItem, buildLectura, toRecords, readyToAccept, VALIDEZ_DIAS } from './asistente-model.js';

const DAY = 86400000;
const listeners = new Set();
let state = { activo: false, expira: null, dispositivos: [], pendientes: 0, error: null };
let unsubs = [];
let pubTimer = null;
let devNames = {};

export const getAssistantState = () => ({ ...state, config: getConfig() });
export function onAssistantChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const setState = (p) => { state = { ...state, ...p }; listeners.forEach((fn) => { try { fn(getAssistantState()); } catch (e) { console.error(e); } }); };

/** Configuración guardada (sincronizada entre los dispositivos del docente): { key, expira (ms), creado (ms) } */
export const getConfig = () => store.getSetting('asistente', null);
export const isActive = () => !!getConfig()?.key;
export const NEED_CLOUD = 'Para usar el acceso de asistente necesitas iniciar sesión con Google en Ajustes → Cuenta y sincronización.';

/** Enlace para el asistente: la llave va tras «#», no se envía a ningún servidor. */
export function assistantLink(key = getConfig()?.key) {
  if (!key) return '';
  const base = location.href.split('#')[0].replace(/[^/]*$/, '');
  return `${base}asistente.html#${key}`;
}

const refs = (c, key) => {
  const { fb, db } = c;
  const root = ['apps', 'tabula', 'asistente', key];
  return {
    grant: fb.fs.doc(db, ...root),
    lectura: fb.fs.doc(db, ...root, 'lectura', 'actual'),
    buzon: fb.fs.collection(db, ...root, 'buzon'),
    dispositivos: fb.fs.collection(db, ...root, 'dispositivos'),
    dispositivo: (id) => fb.fs.doc(db, ...root, 'dispositivos', id),
  };
};
const need = () => { const c = cloud(); if (!c) throw new Error(NEED_CLOUD); return c; };

/** Activa el acceso con una llave nueva (válida 90 días). */
export async function activate() {
  const c = need();
  const key = newKey();
  const expira = Date.now() + VALIDEZ_DIAS * DAY;
  await c.fb.fs.setDoc(refs(c, key).grant, {
    ownerUid: c.uid, activo: true, expira: c.fb.fs.Timestamp.fromMillis(expira), creado: c.fb.fs.serverTimestamp(),
  });
  store.setSetting('asistente', { key, expira, creado: Date.now() });
  await publishLectura();
  start();
  return key;
}

/** Renueva 90 días desde hoy. */
export async function renew() {
  const c = need(); const cfg = getConfig();
  if (!cfg?.key) return;
  const expira = Date.now() + VALIDEZ_DIAS * DAY;
  await c.fb.fs.updateDoc(refs(c, cfg.key).grant, { activo: true, expira: c.fb.fs.Timestamp.fromMillis(expira) });
  store.setSetting('asistente', { ...cfg, expira });
  setState({ expira });
}

/**
 * Desactiva el acceso al momento: primero recoge lo que hubiera en el buzón, después borra
 * lectura, buzón, dispositivos y la concesión. La llave deja de valer para siempre.
 */
export async function deactivate() {
  const c = need(); const cfg = getConfig();
  if (!cfg?.key) return;
  const r = refs(c, cfg.key);
  // Cortar primero (efecto inmediato aunque falle algún borrado posterior)
  try { await c.fb.fs.updateDoc(r.grant, { activo: false }); } catch (e) { console.warn(e); }
  stop();
  try { await pullInbox(cfg.key); } catch (e) { console.warn(e); }
  const delAll = async (col) => { const snap = await c.fb.fs.getDocs(col); for (const d of snap.docs) await c.fb.fs.deleteDoc(d.ref); };
  try { await c.fb.fs.deleteDoc(r.lectura); } catch {}
  try { await delAll(r.buzon); } catch (e) { console.warn(e); }
  try { await delAll(r.dispositivos); } catch (e) { console.warn(e); }
  try { await c.fb.fs.deleteDoc(r.grant); } catch (e) { console.warn(e); }
  store.setSetting('asistente', null);
  setState({ activo: false, expira: null, dispositivos: [], pendientes: 0 });
}

/** Llave nueva: la anterior y sus dispositivos dejan de valer. */
export async function regenerate() {
  await deactivate();
  return activate();
}

export async function approveDevice(id) {
  const c = need(); const cfg = getConfig();
  await c.fb.fs.updateDoc(refs(c, cfg.key).dispositivo(id), { estado: 'aprobado' });
}
export async function removeDevice(id) {
  const c = need(); const cfg = getConfig();
  await c.fb.fs.deleteDoc(refs(c, cfg.key).dispositivo(id));
}

/** Publica la lectura mínima (grupos + iniciales del alumnado, pendientes, horas de eventos). */
export async function publishLectura() {
  const c = cloud(); const cfg = getConfig();
  if (!c || !cfg?.key) return;
  const data = buildLectura({
    groups: store.list('groups'), students: store.list('students'),
    tasks: store.list('tasks'), events: store.list('events'), today: todayISO(),
  });
  await c.fb.fs.setDoc(refs(c, cfg.key).lectura, { ...data, actualizado: c.fb.fs.serverTimestamp() });
}
const schedulePublish = () => {
  if (store._fromRemote && pubTimer) return;
  clearTimeout(pubTimer);
  pubTimer = setTimeout(() => { publishLectura().catch((e) => console.warn('Tabula: lectura del asistente', e)); }, 4000);
};

const studentsMap = () => new Map(store.list('students').map((s) => [s.id, s]));

/** Recoge el buzón: cada apunte válido pasa a la bandeja local y se borra del buzón. */
export async function pullInbox(key = getConfig()?.key) {
  const c = cloud();
  if (!c || !key) return 0;
  const r = refs(c, key);
  const snap = await c.fb.fs.getDocs(r.buzon);
  const ctx = { students: studentsMap(), today: todayISO() };
  const yaEnBandeja = new Set(store.list('bandejaAsistente').map((b) => b.origenId));
  let n = 0;
  for (const d of snap.docs) {
    const a = d.data() || {};
    if (!yaEnBandeja.has(d.id)) {
      const res = normalizeItem(a.tipo, a.datos, ctx);
      if (res.ok) {
        store.add('bandejaAsistente', {
          origenId: d.id, tipo: res.tipo, datos: res.datos, dudas: res.dudas, estado: 'pendiente',
          recibidoEn: a.creado?.toMillis ? a.creado.toMillis() : Date.now(),
          dispositivoId: typeof a.por === 'string' ? a.por.slice(0, 40) : '', dispositivo: devNames[a.por] || 'Asistente',
        });
        n++;
      }
    }
    await c.fb.fs.deleteDoc(d.ref);
  }
  return n;
}

/** Acepta un apunte de la bandeja (con los cambios que haya hecho el docente). Devuelve deshacer(). */
export async function acceptItem(id, datos = null) {
  const item = store.get('bandejaAsistente', id);
  if (!item) return null;
  const it = datos ? { ...item, datos: { ...item.datos, ...datos } } : item;
  if (!readyToAccept(it)) throw new Error('Falta elegir el alumno o alumna');
  const recs = toRecords(it, Date.now(), todayISO());
  const created = [];
  for (const [col, list] of Object.entries(recs)) {
    for (const data of list) {
      if (col === 'reuniones') {
        const { saveReunion } = await import('./views/tutoria/data.js');
        const r = saveReunion(data);
        created.push(['reuniones', r.id]);
        if (r.eventId) created.push(['events', r.eventId]);
      } else created.push([col, store.add(col, data).id]);
    }
  }
  const removed = store.remove('bandejaAsistente', id);
  return () => {
    created.forEach(([col, cid]) => store.remove(col, cid));
    if (removed) store.restore('bandejaAsistente', removed);
  };
}

/** Descarta un apunte. Devuelve deshacer(). */
export function discardItem(id) {
  const removed = store.remove('bandejaAsistente', id);
  return () => { if (removed) store.restore('bandejaAsistente', removed); };
}

export const pendingInbox = () => store.list('bandejaAsistente').sort((a, b) => (a.recibidoEn || 0) - (b.recibidoEn || 0));

// ---------- Escucha en tiempo real mientras Tabula está abierta ----------
function stop() {
  unsubs.forEach((u) => { try { u(); } catch {} });
  unsubs = [];
  clearTimeout(pubTimer);
}

function start() {
  stop();
  const c = cloud(); const cfg = getConfig();
  if (!c || !cfg?.key) { setState({ activo: !!cfg?.key, expira: cfg?.expira || null }); return; }
  const r = refs(c, cfg.key);
  setState({ activo: true, expira: cfg.expira, error: null });
  unsubs.push(c.fb.fs.onSnapshot(r.grant, (snap) => {
    if (!snap.exists()) { setState({ activo: false, error: 'El acceso ya no existe. Actívalo de nuevo.' }); return; }
    const g = snap.data();
    const expira = g.expira?.toMillis ? g.expira.toMillis() : cfg.expira;
    setState({ activo: g.activo === true, expira });
  }, (e) => setState({ error: e.message })));
  unsubs.push(c.fb.fs.onSnapshot(r.dispositivos, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), creado: d.data().creado?.toMillis?.() || null }));
    devNames = Object.fromEntries(list.map((d) => [d.id, d.nombre || 'Dispositivo']));
    setState({ dispositivos: list, pendientes: list.filter((d) => d.estado === 'pendiente').length });
  }, (e) => setState({ error: e.message })));
  unsubs.push(c.fb.fs.onSnapshot(r.buzon, (snap) => { if (!snap.empty) pullInbox(cfg.key).catch((e) => console.warn(e)); }, () => {}));
  for (const col of ['groups', 'students', 'tasks', 'events']) unsubs.push(store.subscribe(col, schedulePublish));
  schedulePublish();
}

/** Arranque: se conecta cuando hay sesión de Google y el acceso está activado. Seguro de llamar siempre. */
export function initAssistant() {
  let last = null;
  const check = () => {
    const c = cloud(); const key = getConfig()?.key || null;
    const sig = c && key ? `${c.uid}:${key}` : null;
    if (sig === last) return;
    last = sig;
    if (sig) start(); else stop();
  };
  onSyncChange(check);
  store.subscribe('settings', check);
  check();
}
