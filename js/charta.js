// Tabula · integración con Charta (app hermana de fichas). Lógica pura, sin DOM; probada con Node.
//
// Contrato de URL (mismo origen; Charta ya lo implementa):
//   Tabula → Charta (crear):  ../Charta/?desde=tabula[&grupo=<id>&sesion=<id>&tarea=<id>]
//   Charta → Tabula (volver): /tabula/?charta=<base64url(JSON UTF-8)>
//       { v:1, id?, titulo, tipos[], comp{}, grupo?, sesion?, tarea?, variantes?, minutos?, dificultad?, etiquetas? }
//   Charta deja además la miniatura de la hoja 1 (sin nombres) en localStorage['charta:aTabula'] = { v:1, titulo, miniatura?, comp? } (mismo origen)
//   Si el enlace fuera largo (> 6 KB), el payload lleva `compLocal: true` en vez de `comp`, y la composición va en ese mismo objeto.
//   Tabula → Charta (abrir):  ../Charta/?ficha=<id>  ó  ../Charta/?comp=<base64url(comp)>  (+ &grupo=<id>&desde=tabula)
// Nunca se envían nombres de alumnos: Charta lee la lista del grupo en el IndexedDB de Tabula.

export const CHARTA_URL = '../Charta/';
const MAX_PAYLOAD = 20000;

/** Texto → base64url (sin «=»), con UTF-8 correcto. */
export function b64urlCodificar(str) {
  const bytes = new TextEncoder().encode(String(str));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → texto UTF-8. Lanza si no es válido. */
export function b64urlDecodificar(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const query = (p) => new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString();

/** Enlace para crear una ficha nueva en Charta. */
export function urlCrearFicha({ groupId, sesionId, tareaId } = {}) {
  return `${CHARTA_URL}?${query({ desde: 'tabula', grupo: groupId, sesion: sesionId, tarea: tareaId })}`;
}

/** Enlace para abrir en Charta una ficha guardada como documento. */
export function urlAbrirFicha(doc, { groupId } = {}) {
  const c = (doc && doc.charta) || {};
  const grupo = groupId || (doc && doc.groupId) || '';
  const base = c.id ? { ficha: c.id } : { comp: b64urlCodificar(JSON.stringify(c.comp || {})) };
  return `${CHARTA_URL}?${query({ ...base, grupo, desde: 'tabula' })}`;
}

const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const idOk = (x) => typeof x === 'string' && x.length > 0 && x.length <= 120;

/** Lee ?charta= de location.search. Devuelve el payload validado o null. */
export function leerEntradaCharta(search) {
  try {
    const raw = new URLSearchParams(search || '').get('charta');
    if (!raw || raw.length > MAX_PAYLOAD) return null;
    const p = JSON.parse(b64urlDecodificar(raw));
    if (!esObjeto(p) || p.v !== 1) return null;
    if (typeof p.titulo !== 'string' || !p.titulo.trim() || p.titulo.length > 200) return null;
    if (p.compLocal === true) { if (p.comp != null) return null; }   // la composición llega por localStorage (compDeCharta)
    else if (!esObjeto(p.comp)) return null;
    if (p.id != null && !idOk(p.id)) return null;
    if (p.tipos != null && (!Array.isArray(p.tipos) || p.tipos.length > 100 || p.tipos.some((t) => typeof t !== 'string' || t.length > 80))) return null;
    for (const k of ['grupo', 'sesion', 'tarea']) if (p[k] != null && !idOk(p[k])) return null;
    const entero = (x, max) => Number.isInteger(x) && x >= 1 && x <= max;
    if (p.variantes != null && !entero(p.variantes, 30)) return null;
    if (p.minutos != null && !entero(p.minutos, 600)) return null;
    if (p.dificultad != null && !entero(p.dificultad, 3)) return null;
    if (p.etiquetas != null && (!Array.isArray(p.etiquetas) || p.etiquetas.length > 12 || p.etiquetas.some((t) => typeof t !== 'string' || t.length > 30))) return null;
    return p;
  } catch { return null; }
}

/** Documento de la colección 'documentos' a partir del payload de Charta. */
export function documentoDeCharta(p) {
  const charta = { tipos: Array.isArray(p.tipos) ? p.tipos : [], comp: p.comp };
  if (p.id) charta.id = p.id;
  if (p.variantes > 1) charta.variantes = p.variantes;
  if (p.minutos) charta.minutos = p.minutos;
  if (p.dificultad) charta.dificultad = p.dificultad;
  return {
    titulo: p.titulo.trim(), tipo: 'charta', nombreArchivo: '', carpeta: 'Charta', etiquetas: Array.isArray(p.etiquetas) ? [...new Set(p.etiquetas.map((t) => t.trim()).filter(Boolean))] : [],
    groupId: p.grupo || null, area: 'Matemáticas', notas: '', favorito: false, charta,
  };
}

/** ¿El documento ya es esta ficha? (mismo id de Charta o, sin id, mismo JSON de composición). */
export function mismaFichaCharta(doc, p) {
  const c = doc && doc.charta;
  if (!c) return false;
  if (p.id) return c.id === p.id;
  if (c.id) return false;
  return JSON.stringify(c.comp) === JSON.stringify(p.comp);
}

export const CLAVE_MINIATURA = 'charta:aTabula';
const MAX_COMP_LOCAL = 200000;

/** Composición que Charta dejó en localStorage cuando el enlace iba a ser largo (`compLocal`), o null. Se comprueba el título. */
export function compDeCharta(raw, titulo) {
  try {
    if (!raw || raw.length > MAX_COMP_LOCAL + 70000) return null;
    const m = JSON.parse(raw);
    if (!esObjeto(m) || m.v !== 1 || m.titulo !== String(titulo || '').slice(0, 200) || !esObjeto(m.comp)) return null;
    return JSON.stringify(m.comp).length <= MAX_COMP_LOCAL ? m.comp : null;
  } catch { return null; }
}
const MAX_MINIATURA = 60000;

/** Miniatura que Charta dejó en localStorage para esta ficha (data URL JPEG/PNG) o null. Se comprueba el título. */
export function miniaturaDeCharta(raw, titulo) {
  try {
    const m = JSON.parse(raw);
    if (!esObjeto(m) || m.v !== 1 || m.titulo !== String(titulo || '').slice(0, 200)) return null;
    if (typeof m.miniatura !== 'string' || m.miniatura.length > MAX_MINIATURA || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(m.miniatura)) return null;
    return m.miniatura;
  } catch { return null; }
}
