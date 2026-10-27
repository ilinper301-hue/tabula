// Tabula · configuración de Firebase
//
// Pega aquí la configuración de la app web de tu proyecto:
// Firebase console → ⚙ Configuración del proyecto → General → Tus apps → (app web) → Configuración del SDK → "Config".
// Estos valores identifican el proyecto; no son secretos. La seguridad la dan las reglas de Firestore (firestore.rules).
//
// Mientras sea null, Tabula funciona solo en el dispositivo, sin cuentas ni sincronización.

export const firebaseConfig = null;
/* Ejemplo:
export const firebaseConfig = {
  apiKey: 'AIza…',
  authDomain: 'tu-proyecto.firebaseapp.com',
  projectId: 'tu-proyecto',
  storageBucket: 'tu-proyecto.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef',
};
*/

/** Versión del SDK de Firebase (se carga desde el CDN oficial de Google). */
export const FIREBASE_SDK = '12.19.0';
