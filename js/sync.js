// Tabula · sincronización con Firebase (Auth de Google + Firestore)
//
// Estructura en Firestore (compatible con otros proyectos en el mismo Firebase):
//   apps/tabula/users/{uid}/{colección}/{id}     un documento por elemento
//   apps/tabula/users/{uid}/meta/settings        ajustes sincronizados
// Las reglas (firestore.rules) solo permiten a cada docente leer y escribir lo suyo.
//
// Funcionamiento:
// - La app siempre lee y escribe en el dispositivo (store.js): es instantánea y funciona sin conexión.
// - Con sesión iniciada, cada cambio se envía a Firestore y los cambios de otros dispositivos llegan
//   por suscripción en tiempo real. Firestore guarda en cola lo que se hace sin conexión.
// - La primera vez que se inicia sesión en un dispositivo con datos, se combinan con la nube
//   (gana la versión modificada más recientemente).
// - Al cerrar sesión se borran los datos del dispositivo (pensado para ordenadores compartidos).

import { store, SYNC_COLLECTIONS } from './store.js';
import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';

const ROOT = ['apps', 'tabula', 'users'];
const BATCH_LIMIT = 400;

let fb = null;      // módulos del SDK
let auth = null;
let db = null;
let unsubs = [];
let state = { enabled: !!firebaseConfig, status: firebaseConfig ? 'loading' : 'off', user: null, error: null };
const listeners = new Set();

/** Estado actual: status = off | loading | signed-out | syncing | synced | offline | error */
export const getSyncState = () => ({ ...state });
export function onSyncChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => { try { fn(getSyncState()); } catch (e) { console.error(e); } });
}

export const SYNC_LABELS = {
  off: 'Solo en este dispositivo',
  loading: 'Conectando…',
  'signed-out': 'Sin sesión iniciada',
  syncing: 'Sincronizando…',
  synced: 'Sincronizado',
  offline: 'Sin conexión',
  error: 'Error de sincronización',
};

function friendlyError(e) {
  const code = (e && e.code) || '';
  if (code.includes('permission-denied')) return 'La nube ha rechazado el acceso. Revisa que las reglas de Firestore incluyan el bloque de Tabula.';
  if (code.includes('unauthorized-domain')) return `Este dominio no está autorizado. Añade «${location.hostname}» en Firebase → Authentication → Configuración → Dominios autorizados.`;
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'Se cerró la ventana de inicio de sesión.';
  if (code.includes('network')) return 'No hay conexión. Inténtalo de nuevo cuando vuelva la red.';
  if (code.includes('operation-not-allowed')) return 'El acceso con Google no está activado en Firebase → Authentication → Método de acceso.';
  return (e && e.message) || 'Error desconocido';
}

async function loadSdk() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}`;
  const [app, authMod, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  return { app, auth: authMod, fs };
}

/** Arranca la sincronización si hay configuración. Seguro de llamar siempre. */
export async function initSync() {
  if (!firebaseConfig) { setState({ status: 'off' }); return; }
  try {
    fb = await loadSdk();
  } catch (e) {
    setState({ status: 'error', error: 'No se pudo cargar Firebase. Revisa la conexión.' });
    return;
  }
  const app = fb.app.initializeApp(firebaseConfig, 'tabula');
  try {
    db = fb.fs.initializeFirestore(app, {
      localCache: fb.fs.persistentLocalCache({ tabManager: fb.fs.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    // Navegación privada u otros casos sin almacenamiento persistente
    db = fb.fs.initializeFirestore(app, { localCache: fb.fs.memoryLocalCache(), ignoreUndefinedProperties: true });
  }
  auth = fb.auth.getAuth(app);
  auth.languageCode = 'es';
  try { await fb.auth.getRedirectResult(auth); } catch (e) { setState({ error: friendlyError(e) }); }

  fb.auth.onAuthStateChanged(auth, (user) => {
    if (user) attach(user).catch((e) => setState({ status: 'error', error: friendlyError(e) }));
    else detach();
  });
  window.addEventListener('online', () => {
    if (!state.user) return;
    setState({ status: 'syncing' });
    import('./files.js').then((f) => f.uploadPending()).catch(() => {});
  });
  window.addEventListener('offline', () => state.user && setState({ status: 'offline' }));
}

export async function signIn() {
  if (!auth) return;
  const provider = new fb.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  setState({ error: null });
  try {
    await fb.auth.signInWithPopup(auth, provider);
  } catch (e) {
    const code = e.code || '';
    if (code.includes('popup-blocked') || code.includes('operation-not-supported')) {
      await fb.auth.signInWithRedirect(auth, provider);
      return;
    }
    setState({ error: friendlyError(e) });
    throw e;
  }
}

/** Cierra sesión y borra los datos de este dispositivo (siguen en la nube). */
export async function signOutAndClear() {
  if (!auth) return;
  detach();
  await fb.auth.signOut(auth);
  await store._clearLocal();
  try { await (await import('./files.js')).clearLocalFiles(); } catch {}
  // Se recarga para vaciar también la caché interna de Firestore
  try { await fb.fs.terminate(db); await fb.fs.clearIndexedDbPersistence(db); } catch {}
  location.reload();
}

// ---------- Conexión de una cuenta ----------
const clean = (item) => JSON.parse(JSON.stringify(item)); // quita undefined y funciones

async function attach(user) {
  detach();
  setState({ status: 'syncing', error: null, user: { name: user.displayName || '', email: user.email || '', photo: user.photoURL || '' } });

  const base = [...ROOT, user.uid];
  const colRef = (c) => fb.fs.collection(db, ...base, c);
  const docRef = (c, id) => fb.fs.doc(db, ...base, c, id);
  const settingsRef = fb.fs.doc(db, ...base, 'meta', 'settings');

  const writeMany = async (ops) => {
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = fb.fs.writeBatch(db);
      ops.slice(i, i + BATCH_LIMIT).forEach(([ref, data]) => batch.set(ref, data));
      await batch.commit();
    }
  };
  const onWriteError = (e) => setState({ status: 'error', error: friendlyError(e) });

  // Otra cuenta usó este dispositivo: sus datos no se mezclan
  const prevUid = store.getSetting('syncUid');
  if (prevUid && prevUid !== user.uid) store._clearLocal();

  // Primera vez de esta cuenta en este dispositivo: combinar datos locales con la nube
  // También si hubo cambios sin conexión a la nube desde la última vez
  if ((prevUid !== user.uid || store._isDirty()) && store._hasLocalData()) {
    const ops = [];
    for (const c of SYNC_COLLECTIONS) {
      const local = store.list(c);
      if (!local.length) continue;
      const snap = await fb.fs.getDocs(colRef(c));
      const remote = new Map(snap.docs.map((d) => [d.id, d.data()]));
      for (const item of local) {
        const r = remote.get(item.id);
        if (!r || (item.updatedAt || 0) > (r.updatedAt || 0)) ops.push([docRef(c, item.id), clean(item)]);
      }
    }
    const remoteSettings = await fb.fs.getDoc(settingsRef);
    const existing = remoteSettings.exists() ? remoteSettings.data() : {};
    const missing = Object.fromEntries(Object.entries(store._settings()).filter(([k]) => !(k in existing)));
    await writeMany(ops);
    if (Object.keys(missing).length) await fb.fs.setDoc(settingsRef, clean(missing), { merge: true });
  }
  store.setSetting('syncUid', user.uid);
  store._clearDirty();

  // A partir de aquí, cada cambio local se envía a la nube
  store._setRemote({
    put: (c, item) => { fb.fs.setDoc(docRef(c, item.id), clean(item)).catch(onWriteError); },
    del: (c, id) => { fb.fs.deleteDoc(docRef(c, id)).catch(onWriteError); },
    putSetting: (k, v) => { fb.fs.setDoc(settingsRef, { [k]: v === undefined ? null : clean({ v }).v }, { merge: true }).catch(onWriteError); },
    putMany: (c, items) => { writeMany(items.map((it) => [docRef(c, it.id), clean(it)])).catch(onWriteError); },
  });

  // Y cada cambio en la nube (de este u otros dispositivos) llega aquí
  for (const c of SYNC_COLLECTIONS) {
    unsubs.push(fb.fs.onSnapshot(colRef(c),
      (snap) => store._applyRemote(c, snap.docs.map((d) => d.data())),
      (e) => setState({ status: 'error', error: friendlyError(e) })));
  }
  unsubs.push(fb.fs.onSnapshot(settingsRef,
    (snap) => { if (snap.exists()) store._applyRemoteSettings(snap.data()); },
    (e) => setState({ status: 'error', error: friendlyError(e) })));
  unsubs.push(fb.fs.onSnapshotsInSync(db, () => {
    if (state.status !== 'error') setState({ status: navigator.onLine ? 'synced' : 'offline' });
  }));
  // Archivos de Documentos guardados sin sesión o sin conexión
  import('./files.js').then((f) => f.uploadPending()).catch(() => {});
}

function detach() {
  unsubs.forEach((u) => { try { u(); } catch {} });
  unsubs = [];
  store._setRemote(null);
  if (state.enabled) setState({ status: 'signed-out', user: null });
}

/**
 * Acceso a Firebase para otros módulos (p. ej. encuestas).
 * Devuelve { fb, db, uid } con sesión iniciada, o null si no hay nube o no hay sesión.
 */
export function cloud() {
  if (!fb || !db || !auth || !auth.currentUser || auth.currentUser.isAnonymous) return null;
  return { fb, db, uid: auth.currentUser.uid };
}
