// Tabula · capa de datos
// Guarda siempre en el dispositivo (localStorage) para que la app funcione al instante y sin conexión.
// Si hay sesión iniciada, sync.js conecta un "remoto" (Firestore) que recibe cada cambio y
// devuelve los cambios hechos en otros dispositivos.
// Las vistas SOLO deben usar este módulo para leer y escribir datos.

import { decidirAlmacen, unirPorId, nuevoDesde } from './datos-model.js';

const PREFIX = 'tabula:v1:';
const cache = new Map();      // colección -> array de items
const listeners = new Map();  // colección -> Set<fn>

/** Colecciones que se sincronizan con la nube. */
export const SYNC_COLLECTIONS = ['tasks', 'groups', 'students', 'schedule', 'events', 'attendance',
  'gradebooks', 'activities', 'grades', 'situaciones', 'sesiones', 'observaciones',
  'programas', 'diarioPrograma', 'encuestas', 'encuestaRespuestas', 'documentos', 'impresiones', 'reuniones', 'medidas', 'informes', 'bandejaAsistente', 'codigos'];
/** Ajustes que se quedan solo en este dispositivo. */
const LOCAL_ONLY_SETTINGS = new Set(['theme', 'syncUid', 'syncEmail', 'lock', 'onboarding']);
/** Claves de localStorage que no son colecciones. */
const NOT_COLLECTION = (k) => k.startsWith('set:') || ['dirty', 'dirtySince', 'borrados', 'lockFails', 'almacen'].includes(k);

// ---------- Almacenamiento de las colecciones ----------
// Las colecciones viven en IndexedDB (base "tabula-data"), sin el límite de ~5 MB de localStorage.
// Se cargan enteras en memoria al arrancar (store.ready()), así la lectura sigue siendo inmediata y síncrona.
// Los ajustes (pequeños, y necesarios antes de pintar) siguen en localStorage.
// Si IndexedDB no existe (navegadores antiguos, Node en las pruebas), se usa localStorage como antes.
// Si existe pero falla al abrirse y este dispositivo ya guardaba en ella, NO se cae a localStorage vacío:
// se bloquea la escritura y la app muestra un aviso con «Reintentar» (ver decidirAlmacen en datos-model.js).
let idb = null;          // IDBDatabase, o null = modo localStorage
let isReady = false;
const MODE_KEY = PREFIX + 'almacen';   // último modo usado con éxito: 'idb' | 'local'
const OPEN_TIMEOUT = 10000;
let almacen = { modo: 'local', aviso: false, bloqueado: false, guardadoFallido: false, error: '' };
const almacenListeners = new Set();
const setAlmacen = (patch) => { almacen = { ...almacen, ...patch }; almacenListeners.forEach((fn) => { try { fn({ ...almacen }); } catch (e) { console.error(e); } }); };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const dirty = new Set();
let flushing = null;
const channel = typeof BroadcastChannel !== 'undefined' && typeof document !== 'undefined' ? new BroadcastChannel('tabula-store') : null;

function openDB() {
  return new Promise((resolve, reject) => {
    // Algunos navegadores (Safari) a veces no responden nunca: se pone tiempo límite
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('IndexedDB no responde')); } }, OPEN_TIMEOUT);
    const fin = (fn, v) => { if (done) { if (fn === resolve) { try { v.close(); } catch {} } return; } done = true; clearTimeout(timer); fn(v); };
    const req = indexedDB.open('tabula-data', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cols')) db.createObjectStore('cols');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => fin(resolve, req.result);
    req.onerror = () => fin(reject, req.error || new Error('error al abrir'));
    req.onblocked = () => fin(reject, new Error('blocked'));
  });
}
const reqP = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const txDone = (t) => new Promise((resolve, reject) => { t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); });

const lsCollectionKeys = () => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX) && !NOT_COLLECTION(k.slice(PREFIX.length))) out.push(k.slice(PREFIX.length));
  }
  return out;
};
const lsRead = (col) => { try { const v = JSON.parse(localStorage.getItem(PREFIX + col)); return Array.isArray(v) ? v : []; } catch { return []; } };

let readyP = null;
/** Carga los datos del dispositivo. Hay que esperarla antes de leer colecciones. */
function ready() {
  if (readyP) return readyP;
  readyP = (async () => {
    const existe = typeof indexedDB !== 'undefined';
    const marca = lsGet(MODE_KEY);
    let fallo = null;
    if (existe) {
      let db = null;
      try {
        db = await openDB();
        const t = db.transaction(['cols', 'meta'], 'readonly');
        const [keys, vals, migrated] = await Promise.all([
          reqP(t.objectStore('cols').getAllKeys()), reqP(t.objectStore('cols').getAll()), reqP(t.objectStore('meta').get('migrated'))]);
        cache.clear();
        keys.forEach((k, i) => cache.set(k, Array.isArray(vals[i]) ? vals[i] : []));
        const cols = lsCollectionKeys();
        if (!migrated || (marca === 'local' && cols.length)) {
          // Primera vez con IndexedDB (o vuelta desde el modo localStorage): se traen los datos que había
          // en localStorage (uniéndolos con lo que hubiera) y, una vez guardados, se borran de allí
          const w = db.transaction(['cols', 'meta'], 'readwrite');
          for (const c of cols) { const items = unirPorId(cache.get(c) || [], lsRead(c)); cache.set(c, items); w.objectStore('cols').put(items, c); }
          w.objectStore('meta').put(Date.now(), 'migrated');
          await txDone(w);
          cols.forEach((c) => { try { localStorage.removeItem(PREFIX + c); } catch {} });
        }
        idb = db;
        db.onversionchange = () => db.close();
      } catch (e) { fallo = e || new Error('error'); try { db && db.close(); } catch {} }
    }
    if (idb) {
      lsSet(MODE_KEY, 'idb');
      setAlmacen({ modo: 'idb', aviso: false, bloqueado: false, guardadoFallido: false, error: '' });
    } else {
      cache.clear();
      let hayAjustes = false;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PREFIX + 'set:') && k !== PREFIX + 'set:theme') { hayAjustes = true; break; }
        }
      } catch {}
      let hayColeccionesLS = false;
      try { hayColeccionesLS = lsCollectionKeys().length > 0; } catch {}
      const d = decidirAlmacen({ existe, fallo: !!fallo, marca, hayAjustes, hayColeccionesLS });
      if (fallo) console.warn('Tabula: IndexedDB existe pero no se pudo abrir', fallo);
      if (d.modo === 'local') lsSet(MODE_KEY, 'local');
      setAlmacen({ modo: d.modo, aviso: d.aviso, bloqueado: d.modo === 'bloqueado', guardadoFallido: false, error: fallo ? String(fallo.message || fallo.name || fallo) : '' });
    }
    isReady = true;
  })();
  return readyP;
}

function read(col) {
  if (!cache.has(col)) cache.set(col, idb ? [] : (typeof localStorage !== 'undefined' ? lsRead(col) : []));
  return cache.get(col);
}

/** Guarda en el dispositivo las colecciones cambiadas (agrupa varios cambios seguidos en una escritura). */
function flush() {
  if (!idb) return Promise.resolve();
  if (flushing) return flushing.then(() => (dirty.size ? flush() : undefined));
  if (!dirty.size) return Promise.resolve();
  const cols = [...dirty]; dirty.clear();
  let done;
  try {
    const t = idb.transaction('cols', 'readwrite');
    cols.forEach((c) => t.objectStore('cols').put(cache.get(c) || [], c));
    done = txDone(t);
  } catch (e) { done = Promise.reject(e); } // p. ej. el navegador cerró la base de datos
  flushing = done
    .then(() => { if (channel) channel.postMessage({ cols }); if (almacen.guardadoFallido) setAlmacen({ guardadoFallido: false, error: '' }); })
    .catch((e) => {
      console.warn('Tabula: no se pudo guardar', e); cols.forEach((c) => dirty.add(c));
      // Los cambios siguen en memoria: se avisa para que el usuario no cierre la app y reintente
      if (!almacen.guardadoFallido) setAlmacen({ guardadoFallido: true, error: String((e && (e.message || e.name)) || e) });
    })
    .finally(() => { flushing = null; });
  return flushing;
}

function persist(col) {
  if (almacen.bloqueado) return; // no se pudo leer lo que había: no se escribe nada encima
  if (!idb) {
    try { localStorage.setItem(PREFIX + col, JSON.stringify(cache.get(col) || [])); }
    catch (e) { console.warn('Tabula: no se pudo guardar', e); }
    return;
  }
  dirty.add(col);
  queueMicrotask(() => { flush(); });
}

// Si se cierra o se oculta la app, se asegura la escritura pendiente
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { flush(); });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

// Remoto conectado por sync.js: { put(col, item), del(col, id), putSetting(key, value), putMany(col, items) }
let remote = null;
const DIRTY_KEY = PREFIX + 'dirty';
const SINCE_KEY = PREFIX + 'dirtySince';  // desde cuándo hay cambios sin enviar (reloj de este dispositivo)
const BORRADOS_KEY = PREFIX + 'borrados'; // { colección: [{ id, at }] } borrados hechos sin conexión con la nube
const leerBorrados = () => { try { const o = JSON.parse(localStorage.getItem(BORRADOS_KEY)); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
const guardarBorrados = (o) => {
  try {
    if (Object.values(o).some((l) => l.length)) localStorage.setItem(BORRADOS_KEY, JSON.stringify(o));
    else localStorage.removeItem(BORRADOS_KEY);
  } catch {}
};
/**
 * Envía un cambio a la nube. Si hay cuenta asociada pero no conexión con la nube (p. ej. app abierta sin red),
 * se marca para combinarlo en la próxima conexión: desde cuándo (at) y, si es un borrado, una marca de borrado.
 */
const toRemote = (fn, at = Date.now(), borrado = null) => {
  if (almacen.bloqueado) return;
  if (remote) { try { fn(remote); } catch (e) { console.warn('Tabula: error de sincronización', e); } return; }
  try {
    if (!localStorage.getItem(PREFIX + 'set:syncUid')) return;
    // Sin marca «desde» pero ya pendiente (versiones anteriores): se queda en 0 = subir todo lo que falte
    const previo = localStorage.getItem(DIRTY_KEY) === '1' ? (localStorage.getItem(SINCE_KEY) ?? 0) : null;
    localStorage.setItem(SINCE_KEY, String(nuevoDesde(previo, at)));
    localStorage.setItem(DIRTY_KEY, '1');
    if (borrado) {
      const o = leerBorrados();
      o[borrado.col] = [...(o[borrado.col] || []).filter((b) => b.id !== borrado.id), { id: borrado.id, at }];
      guardarBorrados(o);
    }
  } catch {}
};
/** Quita la marca de borrado de un item recuperado (Deshacer). */
const quitarBorrado = (col, id) => {
  try {
    const o = leerBorrados();
    if (!o[col] || !o[col].some((b) => b.id === id)) return;
    o[col] = o[col].filter((b) => b.id !== id);
    guardarBorrados(o);
  } catch {}
};

function emit(col) {
  (listeners.get(col) || new Set()).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  (listeners.get('*') || new Set()).forEach((fn) => { try { fn(col); } catch (e) { console.error(e); } });
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const store = {
  /** Espera a que los datos del dispositivo estén cargados (llamar una vez al arrancar). */
  ready,
  /** Fuerza la escritura de los cambios pendientes. */
  flush,
  /** Estado del almacén: { modo: 'idb'|'local'|'bloqueado', aviso, bloqueado, guardadoFallido, error }. */
  get almacen() { return { ...almacen }; },
  /** Avisa cuando cambia el estado del almacén. Devuelve la función para dejar de escuchar. */
  onAlmacen(fn) { almacenListeners.add(fn); return () => almacenListeners.delete(fn); },
  /**
   * Vuelve a intentar abrir IndexedDB. Si falló al arrancar, recarga los datos; si falló al guardar,
   * reabre la base de datos y guarda lo que estaba pendiente (que sigue en memoria).
   * Devuelve el estado del almacén.
   */
  async reintentar() {
    if (almacen.guardadoFallido && isReady && !almacen.bloqueado && almacen.modo === 'idb') {
      try { const db = await openDB(); try { idb && idb.close(); } catch {} idb = db; db.onversionchange = () => db.close(); } catch (e) { return { ...almacen }; }
      await flush();
      return { ...almacen };
    }
    if (idb) return { ...almacen };
    readyP = null; isReady = false;
    await ready();
    return { ...almacen };
  },
  /** true si los datos están en IndexedDB (false = localStorage). */
  get usesIndexedDB() { return !!idb; },
  /** Devuelve una copia de todos los items de una colección. */
  list(col) { return read(col).map((x) => ({ ...x })); },

  get(col, id) { const x = read(col).find((i) => i.id === id); return x ? { ...x } : null; },

  add(col, data) {
    const now = Date.now();
    const item = { id: uid(), createdAt: now, updatedAt: now, ...data };
    read(col).push(item);
    persist(col); emit(col);
    toRemote((r) => r.put(col, item), now);
    return { ...item };
  },

  update(col, id, patch) {
    const items = read(col);
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const now = Date.now();
    items[i] = { ...items[i], ...patch, updatedAt: now };
    persist(col); emit(col);
    toRemote((r) => r.put(col, items[i]), now);
    return { ...items[i] };
  },

  remove(col, id) {
    const items = read(col);
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const [removed] = items.splice(i, 1);
    persist(col); emit(col);
    toRemote((r) => r.del(col, id), Date.now(), { col, id });
    return removed;
  },

  /** Restaura un item borrado (para "Deshacer"). */
  restore(col, item) {
    const items = read(col);
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = item; else items.push(item);
    persist(col); emit(col);
    quitarBorrado(col, item.id);
    toRemote((r) => r.put(col, item));
  },

  /** Escucha cambios en una colección ('*' = todas). Devuelve la función para dejar de escuchar. */
  subscribe(col, fn) {
    if (!listeners.has(col)) listeners.set(col, new Set());
    listeners.get(col).add(fn);
    return () => listeners.get(col).delete(fn);
  },

  // Ajustes simples clave/valor
  getSetting(key, fallback = null) {
    try { const v = localStorage.getItem(PREFIX + 'set:' + key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  setSetting(key, value) {
    if (almacen.bloqueado) return;
    try { localStorage.setItem(PREFIX + 'set:' + key, JSON.stringify(value)); } catch {}
    emit('settings');
    if (!LOCAL_ONLY_SETTINGS.has(key)) toRemote((r) => r.putSetting(key, value));
  },

  /** Copia de seguridad de los datos (JSON). Los archivos de Documentos van aparte (backup.js). */
  exportAll() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const key = k.slice(PREFIX.length);
      if (key.startsWith('set:') && !['set:lock', 'set:syncUid', 'set:syncEmail', 'set:asistente'].includes(key)) out[key] = localStorage.getItem(k);
    }
    for (const [col, items] of cache) if (items.length || SYNC_COLLECTIONS.includes(col)) out[col] = JSON.stringify(items);
    for (const col of SYNC_COLLECTIONS) if (!(col in out)) out[col] = JSON.stringify(read(col));
    return JSON.stringify({ app: 'tabula', version: 2, exportedAt: new Date().toISOString(), data: out });
  },
  /** Restaura una copia. Devuelve una promesa que se cumple cuando todo está guardado. */
  importAll(json) {
    if (almacen.bloqueado) throw new Error('No puedo leer los datos de este dispositivo. Reintenta antes de restaurar una copia.');
    const parsed = JSON.parse(json);
    if (parsed.app !== 'tabula') throw new Error('El archivo no es una copia de Tabula');
    for (const [k, v] of Object.entries(parsed.data || {})) {
      if (['set:lock', 'lockFails', 'dirty', 'dirtySince', 'borrados', 'almacen', 'set:syncUid', 'set:syncEmail', 'set:asistente'].includes(k)) continue;
      if (k.startsWith('set:')) { try { localStorage.setItem(PREFIX + k, v); } catch {} continue; }
      let items = [];
      try { items = JSON.parse(v) || []; } catch { items = []; }
      cache.set(k, Array.isArray(items) ? items : []);
      persist(k);
    }
    // Con sesión iniciada, la copia restaurada se sube también a la nube
    toRemote((r) => {
      SYNC_COLLECTIONS.forEach((col) => r.putMany(col, read(col)));
      Object.entries(this._settings()).forEach(([k, v]) => r.putSetting(k, v));
    }, 0); // sin conexión: en la próxima se sube todo lo que falte en la nube
    emit('*');
    return flush();
  },

  // ---------- Uso interno de sync.js ----------
  _setRemote(r) { remote = r; },
  /** Sustituye una colección por lo que llega de la nube. */
  _applyRemote(col, items) {
    if (almacen.bloqueado) return;
    cache.set(col, items);
    persist(col);
    store._fromRemote = true;
    try { emit(col); } finally { store._fromRemote = false; }
  },
  /** true mientras se notifican cambios que vienen de la nube (no originados aquí). */
  _fromRemote: false,
  _applyRemoteSettings(obj) {
    if (almacen.bloqueado) return;
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (LOCAL_ONLY_SETTINGS.has(k)) return;
      try { localStorage.setItem(PREFIX + 'set:' + k, JSON.stringify(v)); } catch {}
    });
    emit('settings');
  },
  /** Ajustes sincronizables guardados en el dispositivo. */
  _settings() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX + 'set:')) continue;
      const key = k.slice((PREFIX + 'set:').length);
      if (LOCAL_ONLY_SETTINGS.has(key)) continue;
      try { out[key] = JSON.parse(localStorage.getItem(k)); } catch {}
    }
    return out;
  },
  _hasLocalData() { return SYNC_COLLECTIONS.some((c) => read(c).length > 0); },
  get _ready() { return isReady; },
  _isDirty() { try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch { return false; } },
  /** Desde cuándo hay cambios sin enviar (0 = subir todo lo que falte en la nube). */
  _dirtySince() { try { const v = Number(localStorage.getItem(SINCE_KEY) ?? 0); return Number.isFinite(v) ? v : 0; } catch { return 0; } },
  /** Marcas de borrado: { colección: [{ id, at }] }. */
  _borrados() { return leerBorrados(); },
  _hayBorrados() { return Object.values(leerBorrados()).some((l) => Array.isArray(l) && l.length); },
  _clearDirty() { try { [DIRTY_KEY, SINCE_KEY, BORRADOS_KEY].forEach((k) => localStorage.removeItem(k)); } catch {} },
  /** Borra los datos de este dispositivo (al cerrar sesión o cambiar de cuenta). Mantiene el tema. Devuelve una promesa. */
  _clearLocal() {
    if (almacen.bloqueado) return Promise.resolve();
    const keep = new Set(['set:theme']);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !keep.has(k.slice(PREFIX.length))) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    cache.clear(); dirty.clear();
    let p = Promise.resolve();
    if (idb) {
      const t = idb.transaction('cols', 'readwrite');
      t.objectStore('cols').clear();
      p = txDone(t).then(() => { if (channel) channel.postMessage({ cleared: true }); }).catch(() => {});
    }
    SYNC_COLLECTIONS.forEach(emit); emit('settings');
    return p;
  },
};

// Cambios hechos en otra pestaña o ventana de la app
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(PREFIX)) return;
    const key = e.key.slice(PREFIX.length);
    if (key.startsWith('set:')) { emit('settings'); return; }
    if (!idb) { cache.delete(key); emit(key); }
  });
}
if (channel) {
  channel.onmessage = async (e) => {
    if (!idb) return;
    if (e.data?.cleared) { cache.clear(); SYNC_COLLECTIONS.forEach(emit); return; }
    const cols = e.data?.cols || [];
    try {
      const t = idb.transaction('cols', 'readonly');
      const vals = await Promise.all(cols.map((c) => reqP(t.objectStore('cols').get(c))));
      cols.forEach((c, i) => { if (!dirty.has(c)) { cache.set(c, Array.isArray(vals[i]) ? vals[i] : []); emit(c); } });
    } catch {}
  };
}

// Para las pruebas automáticas y la consola
if (typeof window !== 'undefined') window.__tabulaStore = store;
