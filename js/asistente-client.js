// Tabula · acceso de asistente (lado del asistente: página asistente.html).
// Entra con una sesión ANÓNIMA de Firebase (nada de Google) y solo puede:
//   - pedir acceso para este dispositivo y ver si el docente lo ha aprobado,
//   - leer la lectura mínima (grupos + nombres, pendientes y horas),
//   - AÑADIR apuntes al buzón.
// Las reglas de Firestore lo garantizan aunque alguien modificara esta página.

import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';
import { validKey } from './asistente-model.js';

const LS_KEY = 'tabula-asistente:llave';

/** Llave: la del enlace (#…) o la recordada en este dispositivo. La quita de la barra de direcciones. */
export function readKey() {
  const fromHash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  if (validKey(fromHash)) {
    try { localStorage.setItem(LS_KEY, fromHash); } catch {}
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    return fromHash;
  }
  try { const k = localStorage.getItem(LS_KEY); return validKey(k) ? k : null; } catch { return null; }
}
export function forgetKey() { try { localStorage.removeItem(LS_KEY); } catch {} }

const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === undefined || v === '' ? undefined : v)));

/**
 * Conecta con la llave. Devuelve una sesión con métodos, o lanza un error legible.
 * status(): 'sin-pedir' | 'pendiente' | 'aprobado' | 'invalida'
 */
export async function connect(key) {
  if (!firebaseConfig) throw new Error('Esta instalación de Tabula no tiene la nube configurada.');
  if (!validKey(key)) throw new Error('El enlace no es válido.');
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}`;
  const [appMod, authMod, fs] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)]);
  const app = appMod.initializeApp(firebaseConfig, 'tabula-asistente');
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);
  let user;
  try { user = (await authMod.signInAnonymously(auth)).user; }
  catch { throw new Error('No se pudo conectar. Revisa la conexión a internet.'); }
  const root = ['apps', 'tabula', 'asistente', key];
  const devRef = fs.doc(db, ...root, 'dispositivos', user.uid);
  const denied = (e) => String(e?.code || '').includes('permission-denied');

  return {
    uid: user.uid,
    async status() {
      try {
        const s = await fs.getDoc(devRef);
        return s.exists() ? s.data().estado : 'sin-pedir';
      } catch (e) { if (denied(e)) return 'invalida'; throw e; }
    },
    /** Pide acceso para este dispositivo (el docente lo aprueba en Tabula). */
    async requestAccess(nombre) {
      await fs.setDoc(devRef, { estado: 'pendiente', nombre: String(nombre || 'Dispositivo').slice(0, 40), creado: fs.serverTimestamp() });
    },
    /** Avisa cuando cambia el estado (aprobado, retirado o llave desactivada). Devuelve dejar de escuchar. */
    watchStatus(cb) {
      return fs.onSnapshot(devRef, (s) => cb(s.exists() ? s.data().estado : 'sin-pedir'), (e) => cb(denied(e) ? 'invalida' : 'error'));
    },
    /** Lectura mínima: { grupos, pendientes, eventos, actualizado } */
    watchLectura(cb) {
      return fs.onSnapshot(fs.doc(db, ...root, 'lectura', 'actual'),
        (s) => cb(s.exists() ? { ...s.data(), actualizado: s.data().actualizado?.toMillis?.() || null } : null),
        (e) => cb(null, denied(e) ? 'invalida' : 'error'));
    },
    /** Añade un apunte al buzón. tipo: tarea | evento | observacion | reunion */
    async send(tipo, datos) {
      try {
        await fs.addDoc(fs.collection(db, ...root, 'buzon'), { tipo, datos: clean(datos), por: user.uid, creado: fs.serverTimestamp() });
      } catch (e) {
        if (denied(e)) throw new Error('No se pudo guardar: el acceso está desactivado, ha caducado o el apunte no es válido.');
        throw new Error('No se pudo guardar. Revisa la conexión.');
      }
    },
  };
}
