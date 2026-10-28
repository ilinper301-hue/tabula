// Tabula · copia de seguridad completa: datos + archivos de Documentos en un .zip
//
//   tabula.json      datos (store.exportAll)
//   archivos.json    { fileId: { nombre, tipo } }
//   archivos/<fileId> contenido de cada archivo
// El .zip se escribe sin compresión (rápido y sin librerías). Al leer, se aceptan también entradas
// comprimidas (deflate) si el navegador tiene DecompressionStream, y las copias antiguas .json.

import { store } from './store.js';
import { getFile, putLocalFile } from './files.js';

// ---------- ZIP mínimo ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const enc = new TextEncoder();

/** Crea un .zip (Blob) a partir de [{ name, data: Uint8Array }]. */
export function makeZip(entries) {
  const parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const { name, data } of entries) {
    const nameB = enc.encode(name);
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nameB.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

/** Lee un .zip: devuelve Map(nombre → Uint8Array). */
export async function readZip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('El archivo no es un .zip válido');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Índice del .zip dañado');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = u8.subarray(start, start + csize);
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8 && typeof DecompressionStream !== 'undefined') {
      const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out.set(name, new Uint8Array(await new Response(ds).arrayBuffer()));
    } else throw new Error('El .zip usa una compresión que este navegador no puede leer');
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

// ---------- Copia de Tabula ----------
/**
 * Crea la copia completa. Los archivos que solo están en la nube se descargan (si hay sesión).
 * @param onProgress (texto) opcional
 * @returns { blob, nombre, archivos, faltan }
 */
export async function createBackup(onProgress = () => {}) {
  await store.flush();
  const entries = [{ name: 'tabula.json', data: enc.encode(store.exportAll()) }];
  const docs = store.list('documentos').filter((d) => d.fileId);
  const meta = {};
  let faltan = 0;
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    onProgress(`Añadiendo archivos ${i + 1} de ${docs.length}…`);
    let blob = null;
    // Si no está en este dispositivo, getFile lo descarga de la nube (con sesión iniciada)
    try { blob = await getFile(d.fileId); } catch { blob = null; }
    if (!blob) { faltan++; continue; }
    entries.push({ name: `archivos/${d.fileId}`, data: new Uint8Array(await blob.arrayBuffer()) });
    meta[d.fileId] = { nombre: d.nombreArchivo || d.titulo || '', tipo: blob.type || d.tipo || '' };
  }
  entries.push({ name: 'archivos.json', data: enc.encode(JSON.stringify(meta)) });
  onProgress(null);
  const fecha = new Date().toISOString().slice(0, 10);
  store.setSetting('backup:ultima', Date.now());
  return { blob: makeZip(entries), nombre: `tabula-copia-${fecha}.zip`, archivos: Object.keys(meta).length, faltan };
}

/**
 * Restaura una copia (.zip completa o .json antigua). Sustituye los datos actuales.
 * @returns { archivos }
 */
export async function restoreBackup(file, onProgress = () => {}) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (!isZip) { await store.importAll(await file.text()); return { archivos: 0 }; }
  const zip = await readZip(await file.arrayBuffer());
  const json = zip.get('tabula.json');
  if (!json) throw new Error('La copia no contiene datos de Tabula');
  const dec = new TextDecoder();
  let meta = {};
  try { meta = JSON.parse(dec.decode(zip.get('archivos.json') || enc.encode('{}'))); } catch { meta = {}; }
  const ids = Object.keys(meta);
  for (let i = 0; i < ids.length; i++) {
    onProgress(`Restaurando archivos ${i + 1} de ${ids.length}…`);
    const data = zip.get(`archivos/${ids[i]}`);
    if (data) await putLocalFile(ids[i], new Blob([data], { type: meta[ids[i]].tipo || '' }), meta[ids[i]]);
  }
  onProgress(null);
  await store.importAll(dec.decode(json));
  return { archivos: ids.length };
}

/** Días desde la última copia (null si nunca). */
export function daysSinceBackup(now = Date.now()) {
  const t = store.getSetting('backup:ultima', null);
  return t ? Math.floor((now - t) / 86400000) : null;
}
