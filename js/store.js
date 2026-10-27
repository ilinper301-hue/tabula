// Tabula · capa de datos
// Guarda siempre en el dispositivo (localStorage) para que la app funcione al instante y sin conexión.
// Si hay sesión iniciada, sync.js conecta un "remoto" (Firestore) que recibe cada cambio y
// devuelve los cambios hechos en otros dispositivos.
// Las vistas SOLO deben usar este módulo para leer y escribir datos.

const PREFIX = 'tabula:v1:';
const cache = new Map();      // colección -> array de items
const listeners = new Map();  // colección -> Set<fn>

/** Colecciones que se sincronizan con la nube. */
export const SYNC_COLLECTIONS = ['tasks', 'groups', 'students', 'schedule', 'events', 'attendance',
  'gradebooks', 'activities', 'grades', 'situaciones', 'sesiones', 'observaciones',
  'programas', 'diarioPrograma', 'encuestas', 'encuestaRespuestas'];
/** Ajustes que se quedan solo en este dispositivo. */
const LOCAL_ONLY_SETTINGS = new Set(['theme', 'syncUid', 'lock', 'onboarding']);

// Remoto conectado por sync.js: { put(col, item), del(col, id), putSetting(key, value), putMany(col, items) }
let remote = null;
const DIRTY_KEY = PREFIX + 'dirty';
const toRemote = (fn) => {
  if (remote) { try { fn(remote); } catch (e) { console.warn('Tabula: error de sincronización', e); } return; }
  // Cambio hecho con una cuenta asociada pero sin conexión a la nube (p. ej. app abierta sin red):
  // se marca para combinarlo con la nube en la próxima conexión.
  try { if (localStorage.getItem(PREFIX + 'set:syncUid')) localStorage.setItem(DIRTY_KEY, '1'); } catch {}
};

function read(col) {
  if (!cache.has(col)) {
    let items = [];
    try { items = JSON.parse(localStorage.getItem(PREFIX + col)) || []; } catch { items = []; }
    cache.set(col, items);
  }
  return cache.get(col);
}

function persist(col) {
  try { localStorage.setItem(PREFIX + col, JSON.stringify(cache.get(col) || [])); }
  catch (e) { console.warn('Tabula: no se pudo guardar', e); }
}

function emit(col) {
  (listeners.get(col) || new Set()).forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  (listeners.get('*') || new Set()).forEach((fn) => { try { fn(col); } catch (e) { console.error(e); } });
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const store = {
  /** Devuelve una copia de todos los items de una colección. */
  list(col) { return read(col).map((x) => ({ ...x })); },

  get(col, id) { const x = read(col).find((i) => i.id === id); return x ? { ...x } : null; },

  add(col, data) {
    const now = Date.now();
    const item = { id: uid(), createdAt: now, updatedAt: now, ...data };
    read(col).push(item);
    persist(col); emit(col);
    toRemote((r) => r.put(col, item));
    return { ...item };
  },

  update(col, id, patch) {
    const items = read(col);
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return null;
    items[i] = { ...items[i], ...patch, updatedAt: Date.now() };
    persist(col); emit(col);
    toRemote((r) => r.put(col, items[i]));
    return { ...items[i] };
  },

  remove(col, id) {
    const items = read(col);
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const [removed] = items.splice(i, 1);
    persist(col); emit(col);
    toRemote((r) => r.del(col, id));
    return removed;
  },

  /** Restaura un item borrado (para "Deshacer"). */
  restore(col, item) {
    const items = read(col);
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = item; else items.push(item);
    persist(col); emit(col);
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
    try { localStorage.setItem(PREFIX + 'set:' + key, JSON.stringify(value)); } catch {}
    emit('settings');
    if (!LOCAL_ONLY_SETTINGS.has(key)) toRemote((r) => r.putSetting(key, value));
  },

  /** Copia de seguridad completa (JSON). */
  exportAll() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(PREFIX) && !['set:lock', 'lockFails', 'dirty', 'set:syncUid'].includes(k.slice(PREFIX.length))) out[k.slice(PREFIX.length)] = localStorage.getItem(k);
    }
    return JSON.stringify({ app: 'tabula', version: 1, exportedAt: new Date().toISOString(), data: out });
  },
  importAll(json) {
    const parsed = JSON.parse(json);
    if (parsed.app !== 'tabula') throw new Error('El archivo no es una copia de Tabula');
    Object.entries(parsed.data)
      .filter(([k]) => !['set:lock', 'lockFails', 'dirty', 'set:syncUid'].includes(k))
      .forEach(([k, v]) => localStorage.setItem(PREFIX + k, v));
    cache.clear();
    // Con sesión iniciada, la copia restaurada se sube también a la nube
    toRemote((r) => {
      SYNC_COLLECTIONS.forEach((col) => r.putMany(col, read(col)));
      Object.entries(this._settings()).forEach(([k, v]) => r.putSetting(k, v));
    });
    emit('*');
  },

  // ---------- Uso interno de sync.js ----------
  _setRemote(r) { remote = r; },
  /** Sustituye una colección por lo que llega de la nube. */
  _applyRemote(col, items) {
    cache.set(col, items);
    persist(col);
    store._fromRemote = true;
    try { emit(col); } finally { store._fromRemote = false; }
  },
  /** true mientras se notifican cambios que vienen de la nube (no originados aquí). */
  _fromRemote: false,
  _applyRemoteSettings(obj) {
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
  _isDirty() { try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch { return false; } },
  _clearDirty() { try { localStorage.removeItem(DIRTY_KEY); } catch {} },
  /** Borra los datos de este dispositivo (al cerrar sesión o cambiar de cuenta). Mantiene el tema. */
  _clearLocal() {
    const keep = new Set(['set:theme']);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !keep.has(k.slice(PREFIX.length))) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    cache.clear();
    SYNC_COLLECTIONS.forEach(emit); emit('settings');
  },
};

// Si se cambian datos en otra pestaña, refrescamos.
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith(PREFIX)) {
    const col = e.key.slice(PREFIX.length);
    cache.delete(col);
    emit(col);
  }
});
