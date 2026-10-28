// Tabula · Google Drive: elegir archivos con el selector de Google (permiso drive.file).
// Con drive.file, Tabula solo puede abrir los archivos que el docente elige en el selector; nunca ve el resto de su Drive.
// El permiso se pide con Google Identity Services (independiente del inicio de sesión de Firebase) y el token solo vive en memoria.

import { firebaseConfig, googleDrive } from './firebase-config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const driveReady = () => !!googleDrive?.clientId;
export const DRIVE_SETUP = 'La conexión con Drive aún no está configurada (falta el ID de cliente de Google en firebase-config.js).';

const scripts = new Map();
function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = resolve;
      s.onerror = () => { scripts.delete(src); reject(new Error('No se pudo cargar Google. ¿Hay conexión a internet?')); };
      document.head.append(s);
    }));
  }
  return scripts.get(src);
}

let token = null, tokenExp = 0, tokenClient = null;

/** Token de acceso (pide permiso la primera vez; después lo renueva sin preguntar mientras sea válido). */
async function getToken() {
  if (token && Date.now() < tokenExp - 60000) return token;
  await loadScript('https://accounts.google.com/gsi/client');
  return new Promise((resolve, reject) => {
    const done = (r) => {
      if (r.error) { reject(new Error(r.error === 'access_denied' ? 'No has dado permiso para usar Drive.' : 'Google no ha dado permiso para usar Drive.')); return; }
      token = r.access_token; tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
      resolve(token);
    };
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: googleDrive.clientId, scope: SCOPE, callback: done,
        error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'Se cerró la ventana de Google.' : 'No se pudo abrir la ventana de Google.')),
      });
    } else tokenClient.callback = done;
    tokenClient.requestAccessToken({ prompt: token ? '' : undefined });
  });
}

/**
 * Abre el selector de Google Drive.
 * @returns [{ id, nombre, tipo (MIME), url, tamano }]  (vacío si se cancela)
 */
export async function pickFromDrive() {
  if (!driveReady()) throw new Error(DRIVE_SETUP);
  const tk = await getToken();
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise((resolve) => gapi.load('picker', resolve));
  const P = google.picker;
  return new Promise((resolve) => {
    const view = new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true).setMode(P.DocsViewMode.LIST);
    new P.PickerBuilder()
      .addView(view)
      .enableFeature(P.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(tk)
      .setDeveloperKey(googleDrive.apiKey || firebaseConfig.apiKey)
      .setAppId(googleDrive.appId || firebaseConfig.messagingSenderId)
      .setLocale('es')
      .setTitle('Elige archivos para Tabula')
      .setCallback((data) => {
        const action = data[P.Response.ACTION];
        if (action === P.Action.CANCEL) resolve([]);
        if (action !== P.Action.PICKED) return;
        resolve((data[P.Response.DOCUMENTS] || []).map((d) => ({
          id: d[P.Document.ID], nombre: d[P.Document.NAME] || 'Archivo de Drive', tipo: d[P.Document.MIME_TYPE] || '',
          url: d[P.Document.URL] || `https://drive.google.com/file/d/${d[P.Document.ID]}/view`, tamano: Number(d.sizeBytes) || 0,
        })));
      })
      .build()
      .setVisible(true);
  });
}

/** ¿Es un documento nativo de Google (Docs, Hojas, Presentaciones…)? No tiene archivo que descargar. */
export const isGoogleNative = (tipo) => /^application\/vnd\.google-apps\./.test(tipo || '');

/** Descarga un archivo elegido (solo funciona con los que el docente ha elegido en el selector). */
export async function downloadFromDrive(item) {
  const tk = await getToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media`, { headers: { Authorization: `Bearer ${tk}` } });
  if (!res.ok) throw new Error(res.status === 403 || res.status === 404 ? 'Drive no deja descargarlo' : `error ${res.status}`);
  const blob = await res.blob();
  return new File([blob], item.nombre, { type: item.tipo || blob.type });
}
