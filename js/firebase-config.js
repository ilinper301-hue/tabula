// Tabula · configuración de Firebase
// Proyecto compartido con Barri y Lectori ("mis-apps-educativas"). Estos valores identifican el proyecto;
// no son secretos. La seguridad la dan las reglas de Firestore (firestore.rules).

export const firebaseConfig = {
  apiKey: 'AIzaSyC00dEFMyJ48KM--iClXSFUbbMtoHV3ejc',
  authDomain: 'mis-apps-educativas.firebaseapp.com',
  projectId: 'mis-apps-educativas',
  storageBucket: 'mis-apps-educativas.firebasestorage.app',
  messagingSenderId: '98830326152',
  appId: '1:98830326152:web:bd3ff75a1f83ac5fd2c23d',
};

/** Versión del SDK de Firebase (se carga desde el CDN oficial de Google). */
export const FIREBASE_SDK = '12.19.0';

/**
 * Google Drive (Documentos → «Drive»). clientId: ID de cliente OAuth web del proyecto (Firebase → Authentication →
 * Google → Configuración del SDK web). apiKey y appId vacíos = los de firebaseConfig (clave web y número del proyecto).
 */
export const googleDrive = { clientId: '98830326152-er1ld7makl2pcqtckena0u2ujbj0ak8f.apps.googleusercontent.com', apiKey: '', appId: '' };
