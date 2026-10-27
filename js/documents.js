// Tabula · Documentos: modelo puro (sin DOM ni almacenamiento), probado con Node.
//
// documentos   { id, titulo, fileId?, nombreArchivo, tipo, tamano, paginas?, miniatura?, enlace?,
//                carpeta, etiquetas[], groupId?, area?, notas, favorito, copias?, impresoEn? }
//   - fileId: archivo guardado (files.js). enlace: URL externa (Drive, web…) si no hay archivo.
// impresiones  { id, documentoId, fecha (YYYY-MM-DD, para cuándo), copias, dobleCara, color,
//                estado: 'pendiente' | 'impreso', groupId?, sesionId?, nota, impresoEn? }
// sesiones (Planificación) pueden llevar documentoIds[].

export const KINDS = {
  pdf: { label: 'PDF', print: true },
  imagen: { label: 'Imagen', print: true },
  texto: { label: 'Documento', print: false },
  hoja: { label: 'Hoja de cálculo', print: false },
  presentacion: { label: 'Presentación', print: false },
  enlace: { label: 'Enlace', print: false },
  otro: { label: 'Archivo', print: false },
};

/** Tipo de documento a partir del MIME y el nombre. */
export function kindOf(doc) {
  const t = (doc.tipo || '').toLowerCase();
  const n = (doc.nombreArchivo || doc.titulo || '').toLowerCase();
  if (!doc.fileId && doc.enlace) return 'enlace';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(n)) return 'imagen';
  if (/word|opendocument\.text|rtf|text\/plain/.test(t) || /\.(docx?|odt|rtf|txt)$/.test(n)) return 'texto';
  if (/sheet|excel|csv/.test(t) || /\.(xlsx?|ods|csv)$/.test(n)) return 'hoja';
  if (/presentation|powerpoint/.test(t) || /\.(pptx?|odp|key)$/.test(n)) return 'presentacion';
  return 'otro';
}
export const canPrint = (doc) => KINDS[kindOf(doc)].print;

/** Título legible a partir del nombre del archivo. */
export function titleFromFilename(name) {
  const base = String(name || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base[0].toUpperCase() + base.slice(1) : 'Documento';
}

export function formatSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',')} MB`;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Filtra y ordena documentos.
 * @param f { q, carpeta, etiqueta, groupId, area, kind, favoritos }
 * @param sort 'recientes' | 'titulo' | 'impresos'
 */
export function filterDocs(docs, f = {}, sort = 'recientes') {
  const words = norm(f.q).split(/\s+/).filter(Boolean);
  const out = docs.filter((d) => {
    if (f.carpeta && (d.carpeta || '') !== f.carpeta) return false;
    if (f.etiqueta && !(d.etiquetas || []).includes(f.etiqueta)) return false;
    if (f.groupId && d.groupId && d.groupId !== f.groupId) return false;
    if (f.groupId && !d.groupId && f.strictGroup) return false;
    if (f.area && d.area !== f.area) return false;
    if (f.kind && kindOf(d) !== f.kind) return false;
    if (f.favoritos && !d.favorito) return false;
    if (words.length) {
      const hay = norm([d.titulo, d.nombreArchivo, d.carpeta, d.area, d.notas, ...(d.etiquetas || [])].join(' '));
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const by = {
    recientes: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    titulo: (a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es', { sensitivity: 'base' }),
    impresos: (a, b) => (b.impresoEn || 0) - (a.impresoEn || 0) || (b.updatedAt || 0) - (a.updatedAt || 0),
  }[sort] || ((a, b) => 0);
  return out.sort((a, b) => (b.favorito ? 1 : 0) - (a.favorito ? 1 : 0) || by(a, b));
}

/** Carpetas y etiquetas existentes, con su número de documentos. */
export function facets(docs) {
  const carpetas = new Map(), etiquetas = new Map();
  for (const d of docs) {
    if (d.carpeta) carpetas.set(d.carpeta, (carpetas.get(d.carpeta) || 0) + 1);
    for (const t of d.etiquetas || []) etiquetas.set(t, (etiquetas.get(t) || 0) + 1);
  }
  const sorted = (m) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([nombre, n]) => ({ nombre, n }));
  return { carpetas: sorted(carpetas), etiquetas: sorted(etiquetas) };
}

/** "tema 3, Fichas , tema 3" → ['tema 3', 'Fichas'] */
export function parseTags(text) {
  const seen = new Set(), out = [];
  for (const raw of String(text || '').split(',')) {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (t && !seen.has(norm(t))) { seen.add(norm(t)); out.push(t); }
  }
  return out.slice(0, 12);
}

// ---------- Fechas ----------
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

/**
 * Siguiente día lectivo después de `iso` (por defecto, lunes a viernes).
 * @param isLectivo (iso) => boolean opcional (festivos del calendario escolar)
 */
export function nextSchoolDay(iso, isLectivo) {
  const d = fromISO(iso);
  for (let i = 0; i < 30; i++) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    const day = toISO(d);
    if (wd !== 0 && wd !== 6 && (!isLectivo || isLectivo(day))) return day;
  }
  return toISO(d);
}

// ---------- Cola de impresión ----------
/**
 * Cola agrupada para la vista: atrasados (fecha < hoy y pendientes), hoy, mañana (siguiente día lectivo),
 * más adelante, sin fecha, e impresos recientes (7 días).
 */
export function queueSections(cola, today, isLectivo) {
  const next = nextSchoolDay(today, isLectivo);
  const sec = { atrasados: [], hoy: [], manana: [], despues: [], sinFecha: [], impresos: [] };
  const weekAgo = fromISO(today); weekAgo.setDate(weekAgo.getDate() - 7);
  for (const it of cola) {
    if (it.estado === 'impreso') { if ((it.impresoEn || 0) >= weekAgo.getTime()) sec.impresos.push(it); continue; }
    if (!it.fecha) sec.sinFecha.push(it);
    else if (it.fecha < today) sec.atrasados.push(it);
    else if (it.fecha === today) sec.hoy.push(it);
    else if (it.fecha <= next) sec.manana.push(it);
    else sec.despues.push(it);
  }
  const byDate = (a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.createdAt || 0) - (b.createdAt || 0);
  Object.values(sec).forEach((l) => l.sort(byDate));
  sec.impresos.sort((a, b) => (b.impresoEn || 0) - (a.impresoEn || 0));
  sec.manana.fecha = next;
  return sec;
}

/** Pendientes para hoy o antes (lo que hay que llevar a la fotocopiadora ya). */
export const dueNow = (cola, today) => cola.filter((it) => it.estado !== 'impreso' && it.fecha && it.fecha <= today);

/** Total de hojas de una lista de la cola (copias × páginas; a doble cara, la mitad redondeando). */
export function sheetsCount(items, docsById) {
  return items.reduce((s, it) => {
    const p = Number(docsById[it.documentoId]?.paginas) || 1;
    const c = Number(it.copias) || 1;
    return s + c * (it.dobleCara ? Math.ceil(p / 2) : p);
  }, 0);
}

/** Copias por defecto: número de alumnos del grupo (+1 para el docente si se pide). */
export const defaultCopies = (nAlumnos, extra = 0) => Math.max(1, (Number(nAlumnos) || 0) + extra) || 1;
