// Tabula · búsqueda global (lógica pura, sin DOM ni almacenamiento; se prueba con Node).
//
//   buildItems(data, ctx)  → lista de elementos buscables a partir de las colecciones
//   createIndex(items)     → índice (prepara el texto normalizado de cada elemento)
//   search(index, query, { limit, now, recent }) → [{ item, score }] ordenado
//   highlight(text, query) → [{ text, mark }] para pintar el resultado con <mark> sin innerHTML
//
// Elemento: { key, type, title, sub, go, kw, pen, ts, done }
//   go: { hash } | { open: 'ficha'|'tarea', id } | { action: 'nueva-tarea'|…} | { ajuste: 'Título de la tarjeta' }

import { SECTIONS, AJUSTES, NAV_BLOCKS } from './nav-model.js';
import { MEDIDAS, TIPOS_REUNION } from './tutoria.js';
import { KINDS, kindOf } from './documents.js';

export const TYPES = {
  accion: { label: 'Acciones', icon: 'plus' },
  alumno: { label: 'Alumnado', icon: 'user' },
  grupo: { label: 'Grupos', icon: 'grupos' },
  tarea: { label: 'Tareas', icon: 'tareas' },
  evento: { label: 'Calendario', icon: 'calendario' },
  documento: { label: 'Documentos', icon: 'documentos' },
  situacion: { label: 'Situaciones de aprendizaje', icon: 'planificacion' },
  sesion: { label: 'Sesiones', icon: 'clock' },
  reunion: { label: 'Reuniones', icon: 'tutoria' },
  medida: { label: 'Medidas', icon: 'flag' },
  criterio: { label: 'Criterios del cuaderno', icon: 'cuaderno' },
  observacion: { label: 'Observaciones', icon: 'note' },
  programa: { label: 'Planes y programas', icon: 'programas' },
  encuesta: { label: 'Encuestas', icon: 'encuestas' },
  codigo: { label: 'Códigos', icon: 'lock' },
  seccion: { label: 'Secciones', icon: 'sidebar' },
  ajuste: { label: 'Ajustes', icon: 'ajustes' },
};

const EVENT_LABELS = {
  evaluacion: 'Evaluación', reunion: 'Reunión', tutoria: 'Tutoría con familias',
  excursion: 'Salida o excursión', nolectivo: 'No lectivo / festivo', otro: 'Otro',
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ---------- Normalización ----------
/** Minúsculas sin acentos conservando EXACTAMENTE la longitud (para resaltar sobre el original). */
export function foldKeep(s) {
  let out = '';
  for (const c of String(s ?? '')) {
    const f = c.normalize('NFD')[0].toLowerCase();
    out += f.length === c.length ? f : c;
  }
  return out;
}
/** Para comparar: sin acentos y con todo lo que no sea letra o cifra convertido en espacios. */
const flat = (s) => ' ' + foldKeep(s).replace(/[^a-z0-9]+/g, ' ').trim();
const tokensOf = (q) => foldKeep(q).split(/[^a-z0-9]+/).filter(Boolean);

const trunc = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const q = (o) => new URLSearchParams(o).toString();

function fmtDate(iso, now = new Date()) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]}${y !== now.getFullYear() ? ' ' + y : ''}`;
}

// ---------- Elementos fijos: secciones, ajustes y acciones ----------
export function staticItems() {
  const out = [];
  const blockOf = {};
  NAV_BLOCKS.forEach((b) => b.items.forEach((id) => { blockOf[id] = b.label; }));
  for (const [id, s] of Object.entries(SECTIONS)) {
    out.push({ key: `seccion:${id}`, type: 'seccion', title: s.label, sub: blockOf[id], go: { hash: `#/${id}` }, kw: s.desc });
  }
  out.push({ key: 'seccion:ajustes', type: 'seccion', title: AJUSTES.label, sub: 'Configuración', go: { hash: '#/ajustes' }, kw: AJUSTES.desc });

  const aj = (id, title, card, kw, extra = {}) =>
    out.push({ key: `ajuste:${id}`, type: 'ajuste', title, sub: 'Ajustes', go: { ajuste: card }, kw, ...extra });
  aj('perfil', 'Perfil', 'Perfil', 'nombre centro');
  aj('apariencia', 'Color de la app y tema', 'Apariencia', 'color acento tema oscuro claro modo apariencia');
  aj('evaluacion', 'Evaluación por defecto', 'Evaluación', 'escala notas niveles porcentajes criterios cuadernos');
  aj('calendario', 'Calendario escolar', 'Calendario escolar', 'festivos vacaciones días no lectivos curso lectivo');
  aj('curso', 'Nuevo curso', 'Nuevo curso', 'archivar curso siguiente promocionar grupos');
  aj('bloqueo', 'Bloqueo con PIN', 'Bloqueo', 'pin huella face id seguridad privacidad candado');
  aj('cuenta', 'Cuenta y sincronización', 'Cuenta y sincronización', 'google nube sesión dispositivos');
  aj('copia', 'Copia de seguridad', 'Copia de seguridad', 'backup exportar importar restaurar datos descargar');
  aj('barra', 'Barra inferior del móvil', null, 'personalizar atajos menú móvil', { go: { action: 'barra-movil' } });

  const ac = (id, title, kw, sub) => out.push({ key: `accion:${id}`, type: 'accion', title, sub, go: { action: id }, kw });
  ac('nueva-tarea', 'Nueva tarea', 'crear añadir apuntar pendiente', 'Tareas');
  ac('nueva-reunion', 'Nueva reunión', 'crear añadir cita familia tutoría', 'Tutoría');
  ac('subir-documento', 'Subir documento', 'añadir archivo ficha pdf biblioteca', 'Documentos');
  ac('pasar-lista', 'Pasar lista hoy', 'asistencia faltas retrasos presentes', 'Grupos');
  return out;
}

// ---------- Elementos de las colecciones ----------
/**
 * @param data colecciones: { groups, students, tasks, events, documentos, situaciones, sesiones,
 *             reuniones, medidas, programas, encuestas, gradebooks, observaciones }
 * @param ctx  { now?: Date, areaShort?: (area)=>string }
 */
export function buildItems(data = {}, ctx = {}) {
  const now = ctx.now || new Date();
  const area = ctx.areaShort || ((a) => a || '');
  const L = (k) => data[k] || [];
  const groups = new Map(L('groups').map((g) => [g.id, g]));
  const students = new Map(L('students').map((s) => [s.id, s]));
  const sits = new Map(L('situaciones').map((s) => [s.id, s]));
  const gname = (id) => (groups.get(id) || {}).nombre || '';
  const old = (gid) => !!(groups.get(gid) || {}).archivado;
  const oldTag = (gid) => (old(gid) ? 'curso anterior' : '');
  const pname = (s) => (s ? (s.apellidos ? `${s.apellidos}, ${s.nombre}` : s.nombre) : '');
  const join = (...a) => a.filter(Boolean).join(' · ');
  const ts = (x) => x.updatedAt || x.createdAt || 0;
  const PEN = 30;
  const out = [...staticItems()];

  for (const g of L('groups')) {
    out.push({
      key: `grupo:${g.id}`, type: 'grupo', title: g.nombre || 'Grupo',
      sub: join(g.curso ? `${g.curso}º de Primaria` : '', g.cursoEscolar, g.archivado ? 'curso anterior' : ''),
      go: { hash: `#/grupos?${q({ id: g.id })}` }, kw: g.tutoria ? 'tutoría tutor' : '', pen: g.archivado ? PEN : 0, ts: ts(g),
    });
  }
  for (const s of L('students')) {
    out.push({
      key: `alumno:${s.id}`, type: 'alumno', title: pname(s), sub: join(gname(s.groupId), oldTag(s.groupId)),
      go: { open: 'ficha', id: s.id }, kw: 'ficha alumno alumna', pen: old(s.groupId) ? PEN : 0, ts: ts(s),
    });
  }
  for (const t of L('tasks')) {
    const due = t.due ? `${t.done ? '' : 'Vence '}${fmtDate(t.due, now)}` : '';
    out.push({
      key: `tarea:${t.id}`, type: 'tarea', title: t.title || 'Tarea sin título',
      sub: join(t.done ? 'Hecha' : '', due, (t.tags || []).map((x) => `#${x}`).join(' ')),
      go: { open: 'tarea', id: t.id }, kw: `${t.notes || ''} ${(t.tags || []).join(' ')}`,
      pen: t.done ? 20 : 0, ts: ts(t), done: !!t.done,
    });
  }
  for (const e of L('events')) {
    out.push({
      key: `evento:${e.id}`, type: 'evento', title: e.titulo || 'Evento',
      sub: join(fmtDate(e.fecha, now), e.hora, EVENT_LABELS[e.tipo], gname(e.groupId)),
      go: { hash: `#/calendario?${q({ vista: 'semana', fecha: e.fecha })}` }, kw: e.notas || '', ts: ts(e),
    });
  }
  for (const d of L('documentos')) {
    out.push({
      key: `documento:${d.id}`, type: 'documento', title: d.titulo || d.nombreArchivo || 'Documento',
      sub: join((KINDS[kindOf(d)] || {}).label, d.carpeta, (d.etiquetas || []).map((x) => `#${x}`).join(' ')),
      go: { hash: `#/documentos?${q({ doc: d.id })}` },
      kw: [d.nombreArchivo, d.carpeta, d.area, d.notas, ...(d.etiquetas || [])].filter(Boolean).join(' '), ts: ts(d),
    });
  }
  // Códigos: se busca por nombre, tipo, usuario y notas; el código en sí nunca entra en el buscador
  for (const c of L('codigos')) {
    out.push({
      key: `codigo:${c.id}`, type: 'codigo', title: c.titulo || 'Código', sub: join(c.usuario),
      go: { hash: '#/codigos' }, kw: [c.categoria, c.notas].filter(Boolean).join(' '), ts: ts(c),
    });
  }
  for (const s of L('situaciones')) {
    out.push({
      key: `situacion:${s.id}`, type: 'situacion', title: s.titulo || 'Situación de aprendizaje',
      sub: join(area(s.area), gname(s.groupId), oldTag(s.groupId)),
      go: { hash: `#/planificacion?${q({ sit: s.id })}` }, kw: `${s.descripcion || ''} ${s.productoFinal || ''}`,
      pen: old(s.groupId) ? PEN : 0, ts: ts(s),
    });
  }
  for (const s of L('sesiones')) {
    const sit = sits.get(s.situacionId);
    out.push({
      key: `sesion:${s.id}`, type: 'sesion', title: s.titulo || 'Sesión',
      sub: join(area(s.area), sit && sit.titulo, fmtDate(s.fecha, now), oldTag(s.groupId)),
      go: { hash: `#/planificacion?${q({ sit: s.situacionId })}` }, kw: `${s.objetivo || ''} ${s.materiales || ''}`,
      pen: old(s.groupId) ? PEN : 0, ts: ts(s),
    });
  }
  for (const r of L('reuniones')) {
    const names = (r.studentIds || []).map((id) => students.get(id)).filter(Boolean).map((s) => [s.nombre, s.apellidos].filter(Boolean).join(' '));
    out.push({
      key: `reunion:${r.id}`, type: 'reunion',
      title: names.length ? `Reunión · ${names.join(', ')}` : `Reunión · ${trunc(r.motivo, 60) || TIPOS_REUNION[r.tipo] || 'tutoría'}`,
      sub: join(TIPOS_REUNION[r.tipo], fmtDate(r.fecha, now), r.estado === 'prevista' ? 'Prevista' : r.estado === 'cancelada' ? 'Cancelada' : '', oldTag(r.groupId)),
      go: { hash: `#/tutoria?${q({ reunion: r.id })}` }, kw: `${r.motivo || ''} ${r.resumen || ''} ${r.asistentes || ''}`,
      pen: old(r.groupId) ? PEN : 0, ts: ts(r),
    });
  }
  for (const m of L('medidas')) {
    const st = students.get(m.studentId);
    const label = (MEDIDAS[m.tipo] || {}).label || 'Medida';
    out.push({
      key: `medida:${m.id}`, type: 'medida', title: join(pname(st), label),
      sub: join(gname(m.groupId), m.estado === 'finalizada' ? 'Finalizada' : '', oldTag(m.groupId)),
      go: { hash: `#/tutoria?${q({ grupo: m.groupId, tab: 'diversidad', alumno: m.studentId })}` },
      kw: `medida atención diversidad ${m.detalle || ''} ${m.profesional || ''}`,
      pen: (old(m.groupId) ? PEN : 0) + (m.estado === 'finalizada' ? 10 : 0), ts: ts(m),
    });
  }
  for (const p of L('programas')) {
    out.push({
      key: `programa:${p.id}`, type: 'programa', title: p.nombre || 'Programa',
      sub: join(p.tipo, p.cursoEscolar, p.archivado ? 'archivado' : ''),
      go: { hash: `#/programas?${q({ id: p.id })}` }, kw: `${p.descripcion || ''} ${p.etiqueta || ''}`, pen: p.archivado ? 20 : 0, ts: ts(p),
    });
  }
  for (const e of L('encuestas')) {
    out.push({
      key: `encuesta:${e.id}`, type: 'encuesta', title: e.titulo || 'Encuesta',
      sub: join('Encuesta', e.estado), go: { hash: `#/encuestas?${q({ id: e.id })}` }, kw: e.descripcion || '', ts: ts(e),
    });
  }
  for (const gb of L('gradebooks')) {
    const g = gname(gb.groupId);
    for (const c of gb.criterios || []) {
      if (!c.codigo && !c.descripcion) continue;
      out.push({
        key: `criterio:${gb.id}:${c.id || c.codigo}`, type: 'criterio',
        title: c.codigo ? `${c.codigo} · ${trunc(c.descripcion, 90)}` : trunc(c.descripcion, 100),
        sub: join(area(gb.area), g, oldTag(gb.groupId)),
        go: { hash: `#/cuaderno?${q({ grupo: gb.groupId, area: gb.area })}` }, kw: c.descripcion || '',
        pen: old(gb.groupId) ? PEN : 0, ts: ts(gb),
      });
    }
  }
  for (const o of L('observaciones')) {
    if (!o.texto && !o.etiqueta) continue;
    const st = students.get(o.studentId);
    out.push({
      key: `observacion:${o.id}`, type: 'observacion', title: trunc(o.texto || o.etiqueta, 90),
      sub: join(pname(st), fmtDate(o.fecha, now), oldTag(o.groupId)),
      go: { hash: `#/grupos?${q({ id: o.groupId, tab: 'observaciones' })}` }, kw: `${o.etiqueta || ''} ${pname(st)}`,
      pen: old(o.groupId) ? PEN : 0, ts: ts(o),
    });
  }
  return out;
}

// ---------- Índice y puntuación ----------
export function createIndex(items) {
  return items.map((item) => ({ item, t: flat(item.title), k: flat(`${item.kw || ''} ${item.sub || ''}`) }));
}

function tokenScore(e, tk) {
  const i = e.t.indexOf(' ' + tk);
  if (i === 0) return e.t === ' ' + tk ? 100 : 80;
  if (i > 0) return 60;
  if (tk.length > 1 && e.t.includes(tk)) return 35;
  if (e.k.includes(' ' + tk)) return 22;
  if (tk.length > 1 && e.k.includes(tk)) return 12;
  return -1;
}

const DAY = 86400000;
/**
 * Busca en el índice. Todas las palabras de la consulta deben aparecer (en el título o en el resto del texto).
 * Orden: título exacto/empieza por > inicio de palabra > contiene; lo reciente puntúa un poco más.
 * @param opts { limit = 40, now = Date.now(), recent: string[] (claves abiertas hace poco, la primera es la última) }
 */
export function search(index, query, { limit = 40, now = Date.now(), recent = [] } = {}) {
  const tks = tokensOf(query);
  if (!tks.length) return [];
  const full = ' ' + tks.join(' ');
  const rec = new Map(recent.map((k, i) => [k, i]));
  const hits = [];
  for (const e of index) {
    let sum = 0;
    let ok = true;
    for (const tk of tks) {
      const s = tokenScore(e, tk);
      if (s < 0) { ok = false; break; }
      sum += s;
    }
    if (!ok) continue;
    let score = sum / tks.length;
    if (e.t.startsWith(full)) score += 15;
    const it = e.item;
    score -= it.pen || 0;
    if (it.ts) {
      const age = (now - it.ts) / DAY;
      score += age <= 3 ? 6 : age <= 14 ? 4 : age <= 60 ? 2 : 0;
    }
    if (rec.has(it.key)) score += 8 - Math.min(rec.get(it.key), 5);
    hits.push({ item: it, score, len: e.t.length });
  }
  hits.sort((a, b) => b.score - a.score || a.len - b.len || a.item.title.localeCompare(b.item.title, 'es'));
  return hits.slice(0, limit).map(({ item, score }) => ({ item, score }));
}

/** Trozos del texto con las palabras buscadas marcadas: [{ text, mark }]. */
export function highlight(text, query) {
  const src = String(text ?? '');
  const f = foldKeep(src);
  const ranges = [];
  for (const tk of tokensOf(query)) {
    // Preferimos el inicio de palabra; si no, cualquier coincidencia
    let from = 0, at = -1, any = -1;
    while ((from = f.indexOf(tk, from)) !== -1) {
      if (any < 0) any = from;
      if (from === 0 || !/[a-z0-9]/.test(f[from - 1])) { at = from; break; }
      from += 1;
    }
    if (at < 0) at = tk.length > 1 ? any : -1;
    if (at >= 0) ranges.push([at, at + tk.length]);
  }
  if (!ranges.length) return [{ text: src, mark: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0].slice()];
  for (const r of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice());
  }
  const out = [];
  let pos = 0;
  for (const [a, b] of merged) {
    if (a > pos) out.push({ text: src.slice(pos, a), mark: false });
    out.push({ text: src.slice(a, b), mark: true });
    pos = b;
  }
  if (pos < src.length) out.push({ text: src.slice(pos), mark: false });
  return out;
}

/** Agrupa resultados por tipo conservando el orden de mejor puntuación; máx. `perType` por tipo. */
export function groupResults(results, perType = 6) {
  const groups = [];
  const byType = new Map();
  for (const r of results) {
    let g = byType.get(r.item.type);
    if (!g) { g = { type: r.item.type, results: [] }; byType.set(r.item.type, g); groups.push(g); }
    if (g.results.length < perType) g.results.push(r);
  }
  return groups;
}
