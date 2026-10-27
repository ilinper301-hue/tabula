// Tabula · archivos de Documentos (PDF, imágenes…)
//
// - En el dispositivo: IndexedDB (base "tabula-files"), para abrir e imprimir sin conexión.
// - En la nube (con sesión iniciada): Firestore, troceado porque cada documento admite ~1 MB:
//     apps/tabula/users/{uid}/files/{fileId}            { n, tipo, tamano, nombre, updatedAt }
//     apps/tabula/users/{uid}/files/{fileId}/c/{i}      { d: Bytes }
//   Las reglas ya existentes (users/{uid}/{document=**}) solo dejan entrar a su dueño.
// - Los metadatos (título, carpeta, etiquetas…) van en la colección normal "documentos" de store.js.
// - En otro dispositivo, el archivo se descarga la primera vez que se abre y queda guardado.

import { cloud } from './sync.js';

export const MAX_FILE_MB = 15;
const CHUNK = 700 * 1024;
const DB_NAME = 'tabula-files';
let dbp = null;

function idb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending'); // subidas a la nube pendientes
      if (!db.objectStoreNames.contains('shared')) db.createObjectStore('shared', { autoIncrement: true }); // recibido con «Compartir» (sw.js)
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Guarda un archivo en el dispositivo y, si hay sesión, en la nube.
 * @returns { fileId, nombre, tipo, tamano }
 */
export async function saveFile(file) {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`El archivo ocupa más de ${MAX_FILE_MB} MB`);
  const fileId = newId();
  const meta = { nombre: file.name || 'archivo', tipo: file.type || '', tamano: file.size };
  const blob = new Blob([await file.arrayBuffer()], { type: meta.tipo });
  await tx('blobs', 'readwrite', (s) => s.put(blob, fileId));
  await tx('pending', 'readwrite', (s) => s.put(meta, fileId));
  uploadPending().catch(() => {});
  return { fileId, ...meta };
}

/** ¿Está el archivo en este dispositivo? */
export async function hasLocalFile(fileId) {
  if (!fileId) return false;
  const k = await tx('blobs', 'readonly', (s) => s.getKey(fileId));
  return k !== undefined;
}

/**
 * Devuelve el archivo (Blob) o null. Si no está en el dispositivo y hay sesión, lo descarga.
 * @param onProgress (0..1) opcional durante la descarga
 */
export async function getFile(fileId, onProgress) {
  if (!fileId) return null;
  const local = await tx('blobs', 'readonly', (s) => s.get(fileId));
  if (local) return local;
  const c = cloud();
  if (!c) return null;
  const { fb, db, uid } = c;
  const metaSnap = await fb.fs.getDoc(fb.fs.doc(db, 'apps', 'tabula', 'users', uid, 'files', fileId));
  if (!metaSnap.exists()) return null;
  const meta = metaSnap.data();
  const parts = [];
  for (let i = 0; i < meta.n; i++) {
    const snap = await fb.fs.getDoc(fb.fs.doc(db, 'apps', 'tabula', 'users', uid, 'files', fileId, 'c', String(i)));
    if (!snap.exists()) return null;
    parts.push(snap.data().d.toUint8Array());
    if (onProgress) onProgress((i + 1) / meta.n);
  }
  const blob = new Blob(parts, { type: meta.tipo || '' });
  await tx('blobs', 'readwrite', (s) => s.put(blob, fileId));
  return blob;
}

/** Borra el archivo del dispositivo y de la nube. */
export async function deleteFile(fileId) {
  if (!fileId) return;
  await tx('blobs', 'readwrite', (s) => s.delete(fileId));
  await tx('pending', 'readwrite', (s) => s.delete(fileId));
  const c = cloud();
  if (!c) return; // si se borra sin conexión a la cuenta, en la nube queda un archivo huérfano (inofensivo)
  const { fb, db, uid } = c;
  const metaRef = fb.fs.doc(db, 'apps', 'tabula', 'users', uid, 'files', fileId);
  try {
    const snap = await fb.fs.getDoc(metaRef);
    const n = snap.exists() ? snap.data().n : 0;
    await fb.fs.deleteDoc(metaRef);
    for (let i = 0; i < n; i++) await fb.fs.deleteDoc(fb.fs.doc(db, 'apps', 'tabula', 'users', uid, 'files', fileId, 'c', String(i)));
  } catch (e) { console.warn('Tabula: no se pudo borrar el archivo de la nube', e); }
}

let uploading = null;
/** Sube a la nube los archivos guardados sin sesión o sin conexión. Seguro de llamar siempre. */
export function uploadPending() {
  if (uploading) return uploading;
  uploading = (async () => {
    const c = cloud();
    if (!c || !navigator.onLine) return 0;
    const { fb, db, uid } = c;
    const keys = await tx('pending', 'readonly', (s) => s.getAllKeys());
    let done = 0;
    for (const fileId of keys || []) {
      const meta = await tx('pending', 'readonly', (s) => s.get(fileId));
      const blob = await tx('blobs', 'readonly', (s) => s.get(fileId));
      if (!blob) { await tx('pending', 'readwrite', (s) => s.delete(fileId)); continue; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const n = Math.max(1, Math.ceil(bytes.length / CHUNK));
      for (let i = 0; i < n; i++) {
        await fb.fs.setDoc(fb.fs.doc(db, 'apps', 'tabula', 'users', uid, 'files', fileId, 'c', String(i)),
          { d: fb.fs.Bytes.fromUint8Array(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)) });
      }
      // El documento principal se escribe al final: si existe, el archivo está completo
      await fb.fs.setDoc(fb.fs.doc(db, 'apps', 'tabula', 'users', uid, 'files', fileId),
        { n, tipo: meta?.tipo || blob.type || '', tamano: bytes.length, nombre: meta?.nombre || '', updatedAt: Date.now() });
      await tx('pending', 'readwrite', (s) => s.delete(fileId));
      done++;
    }
    return done;
  })().finally(() => { uploading = null; });
  return uploading;
}

/** Vacía los archivos del dispositivo (al cerrar sesión). */
export async function clearLocalFiles() {
  try {
    await tx('blobs', 'readwrite', (s) => s.clear());
    await tx('pending', 'readwrite', (s) => s.clear());
  } catch {}
}

/** Espacio aproximado usado por el navegador (MB), o null. */
export async function storageUsageMB() {
  try { const e = await navigator.storage.estimate(); return Math.round((e.usage || 0) / 1048576); } catch { return null; }
}

// ---------- Miniaturas ----------
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
let pdfjsP = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsP) {
    pdfjsP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${PDFJS}/pdf.min.js`;
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`; resolve(window.pdfjsLib); };
      s.onerror = () => { pdfjsP = null; reject(new Error('No se pudo cargar el lector de PDF')); };
      document.head.append(s);
    });
  }
  return pdfjsP;
}

const canvasToDataURL = (canvas) => canvas.toDataURL('image/jpeg', 0.72);

/**
 * Miniatura (JPEG en data URL, ~240 px de ancho) y número de páginas.
 * Devuelve { miniatura, paginas } o { miniatura: null } si no se puede generar.
 */
export async function makeThumbnail(blob, tipo, width = 240) {
  try {
    if ((tipo || '').startsWith('image/')) {
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, width / bmp.width);
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      return { miniatura: canvasToDataURL(cv), paginas: 1 };
    }
    if (tipo === 'application/pdf') {
      const lib = await loadPdfJs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      const page = await pdf.getPage(1);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: width / vp0.width });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const paginas = pdf.numPages;
      pdf.destroy();
      return { miniatura: canvasToDataURL(cv), paginas };
    }
  } catch (e) { console.warn('Tabula: sin miniatura', e); }
  // Sin lector de PDF (sin conexión): al menos se cuentan las páginas
  if (tipo === 'application/pdf') {
    try {
      const txt = new TextDecoder('latin1').decode(await blob.arrayBuffer());
      const n = (txt.match(/\/Type\s*\/Page(?!s)/g) || []).length;
      if (n) return { miniatura: null, paginas: n };
    } catch {}
  }
  return { miniatura: null };
}

// ---------- Abrir e imprimir ----------
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Abre el archivo en una pestaña nueva (o lo descarga si el navegador no sabe mostrarlo). */
export function openBlob(blob, nombre = 'archivo') {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener');
  if (!w) { const a = document.createElement('a'); a.href = url; a.download = nombre; a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadBlob(blob, nombre = 'archivo') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Lanza el diálogo de impresión del sistema.
 * - PDF: se imprime desde un marco oculto (Chrome, Edge, Firefox). En iPad/iPhone se abre en una pestaña,
 *   donde se imprime con Compartir → Imprimir; devuelve 'opened'.
 * - Imagen: se ajusta a una hoja A4.
 * @returns 'printed' | 'opened' | 'unsupported'
 */
export async function printBlob(blob, tipo, { titulo = 'Documento' } = {}) {
  const isPdf = tipo === 'application/pdf';
  const isImg = (tipo || '').startsWith('image/');
  if (tipo === 'text/html') return printHtml(await blob.text());
  if (!isPdf && !isImg) return 'unsupported';
  if (isPdf && isIOS()) { openBlob(blob, titulo); return 'opened'; }

  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  const done = () => setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
  await new Promise((resolve) => {
    frame.onload = () => {
      const go = () => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { openBlob(blob, titulo); }
        resolve();
      };
      if (isImg) {
        const img = frame.contentDocument.querySelector('img');
        if (img && !img.complete) img.onload = go; else go();
      } else setTimeout(go, 250);
    };
    if (isImg) {
      const safeTitle = String(titulo).replace(/[<>&"]/g, '');
      frame.srcdoc = `<!doctype html><html><head><title>${safeTitle}</title><style>@page{size:A4;margin:10mm}html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body><img src="${url}" alt=""></body></html>`;
    } else frame.src = url;
    document.body.append(frame);
  });
  done();
  return 'printed';
}

/**
 * Imprime una ficha HTML en un marco aislado: sin scripts (sandbox sin allow-scripts).
 * @returns 'printed'
 */
export async function printHtml(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:794px;height:1123px;border:0;visibility:hidden';
  await new Promise((resolve) => {
    frame.onload = () => setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { console.warn(e); }
      resolve();
    }, 300);
    frame.srcdoc = html;
    document.body.append(frame);
  });
  setTimeout(() => frame.remove(), 60_000);
  return 'printed';
}

/** Archivos y textos recibidos con «Compartir → Tabula» (Android): [{ key, file? , title?, text?, url? }]. */
export async function listShared() {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const out = [];
      const req = db.transaction('shared', 'readonly').objectStore('shared').openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out.push({ key: c.key, ...c.value }); c.continue(); } else resolve(out); };
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}
/** Borra lo recibido ya importado (solo después de guardarlo, para no perder nada si se cierra la app a medias). */
export async function removeShared(keys) {
  try { await tx('shared', 'readwrite', (s) => { keys.forEach((k) => s.delete(k)); }); } catch {}
}
