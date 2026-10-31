// Tabula · lectura de Calculi (cálculo mental). Lógica pura: sin DOM ni almacenamiento propio.
//
// Calculi se publica en el mismo dominio que Tabula y deja en localStorage, clave «calc.tabula», un resumen:
//   { app:'calculi', v:1, ts, alumnos:[{ id, n, curso, estrellas, diasPractica, ultimoDia,
//       trucos:[{ id, nombre, curso, trimestre, dominio (0–100 | null), semaforo:'v'|'a'|'r'|'g', estrellas, intentos, ultimo }] }] }
// Tabula solo lo LEE (nunca escribe claves de otras apps).
//
// Las notas que se pasan al Cuaderno son: dominio / 10 (escala 0–10). Sin datos suficientes en Calculi → sin nota.

export const CALCULI_KEY = 'calc.tabula';
export const CALCULI_URL = 'https://ilinper301-hue.github.io/Calculi/';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Lee y valida el resumen de Calculi. null si no hay datos o no tienen la forma esperada. */
export function readCalculi(storage = globalThis.localStorage) {
  let d;
  try { d = JSON.parse(storage?.getItem(CALCULI_KEY) || 'null'); } catch { return null; }
  if (!d || d.app !== 'calculi' || !Array.isArray(d.alumnos)) return null;
  const alumnos = d.alumnos.filter((a) => a && typeof a.n === 'string' && Array.isArray(a.trucos)).map((a) => ({
    id: String(a.id || a.n), n: a.n.trim(), curso: isNum(a.curso) ? a.curso : null, estrellas: a.estrellas | 0,
    trucos: a.trucos.filter((t) => t && t.id && t.nombre).map((t) => ({
      id: String(t.id), nombre: String(t.nombre), curso: t.curso | 0, trimestre: t.trimestre | 0,
      dominio: isNum(t.dominio) ? Math.max(0, Math.min(100, t.dominio)) : null,
      semaforo: ['v', 'a', 'r', 'g'].includes(t.semaforo) ? t.semaforo : 'g', estrellas: t.estrellas | 0, intentos: t.intentos | 0, ultimo: t.ultimo || null,
    })),
  }));
  return { ts: isNum(d.ts) ? d.ts : null, alumnos };
}

/**
 * Empareja alumnos de Tabula con alumnos de Calculi por el nombre.
 * Calculi suele guardar solo el nombre («Lucía») o nombre e inicial («Lucía G.»).
 * Solo se empareja si no hay dudas: un nombre de Calculi que encaja con dos alumnos del grupo se deja sin emparejar.
 * @returns { [studentId]: calculiId }
 */
export function matchCalculi(students, alumnos) {
  const score = (s, a) => {
    const full = norm(`${s.nombre} ${s.apellidos || ''}`), nom = norm(s.nombre), q = norm(a.n);
    if (!q) return null;
    if (q === full) return 0;
    if (q === nom) return 1;
    const parts = full.split(' '), words = q.split(' ');
    // Todas las palabras (o iniciales «g.») encajan, en orden, con el nombre completo
    let i = 0;
    for (const w of words) {
      const ini = /^[a-zñ]\.?$/.test(w) && w.length <= 2;
      while (i < parts.length && !(ini ? parts[i][0] === w[0] : parts[i] === w)) i++;
      if (i++ >= parts.length) return null;
    }
    return 2;
  };
  const cands = [];
  for (const s of students) for (const a of alumnos) { const sc = score(s, a); if (sc !== null) cands.push({ s: s.id, a: a.id, sc }); }
  const out = {};
  // Ambigüedad: si un alumno de Calculi encaja igual de bien con varios de Tabula (o al revés), no se empareja.
  for (const c of cands) {
    const rivalesA = cands.filter((x) => x.a === c.a && x.sc === c.sc);
    const rivalesS = cands.filter((x) => x.s === c.s && x.sc === c.sc);
    const mejorA = Math.min(...cands.filter((x) => x.a === c.a).map((x) => x.sc));
    const mejorS = Math.min(...cands.filter((x) => x.s === c.s).map((x) => x.sc));
    if (c.sc === mejorA && c.sc === mejorS && rivalesA.length === 1 && rivalesS.length === 1) out[c.s] = c.a;
  }
  return out;
}

/** Nota de Tabula (0–10) a partir del dominio de Calculi (0–100). */
export const gradeFromDominio = (d) => (isNum(d) ? Math.round(d) / 10 : null);

/** Trucos de un curso que tienen datos en al menos uno de los alumnos emparejados (ordenados por trimestre y nombre). */
export function trucosConDatos(alumnos, ids, curso) {
  const m = new Map();
  for (const a of alumnos) if (ids.has(a.id)) for (const t of a.trucos) {
    if (curso && t.curso !== curso) continue;
    const prev = m.get(t.id) || { id: t.id, nombre: t.nombre, curso: t.curso, trimestre: t.trimestre, conDatos: 0 };
    if (t.dominio !== null) prev.conDatos++;
    m.set(t.id, prev);
  }
  return [...m.values()].sort((x, y) => x.trimestre - y.trimestre || x.nombre.localeCompare(y.nombre, 'es'));
}

/**
 * Prepara las columnas que se añadirán al Cuaderno.
 * @param mapa    { [studentId]: calculiId }
 * @param trucos  ids de trucos elegidos
 * @param modo    'truco' (una columna por truco) | 'media' (una columna con la media de los trucos)
 * @returns [{ clave, nombre, notas: { [studentId]: { v, c } } }]   (clave identifica la columna para no duplicarla al volver a traer)
 */
export function planCalculi({ alumnos, mapa, trucos, modo }) {
  const byId = new Map(alumnos.map((a) => [a.id, a]));
  const dato = (sid, tid) => { const a = byId.get(mapa[sid]); return a ? a.trucos.find((t) => t.id === tid) || null : null; };
  const nombreDe = (tid) => { for (const a of alumnos) { const t = a.trucos.find((x) => x.id === tid); if (t) return t.nombre; } return tid; };
  const sids = Object.keys(mapa).filter((sid) => byId.has(mapa[sid]));
  if (modo === 'media') {
    const notas = {};
    for (const sid of sids) {
      const ds = trucos.map((tid) => dato(sid, tid)).filter((t) => t && t.dominio !== null);
      if (!ds.length) continue;
      const media = ds.reduce((s, t) => s + t.dominio, 0) / ds.length;
      notas[sid] = { v: gradeFromDominio(media), c: `Calculi: ${ds.length} ${ds.length === 1 ? 'truco' : 'trucos'} con datos` };
    }
    return [{ clave: `calculi:media:${[...trucos].sort().join(',')}`, nombre: 'Cálculo mental (Calculi)', notas }];
  }
  return trucos.map((tid) => {
    const notas = {};
    for (const sid of sids) {
      const t = dato(sid, tid);
      if (t && t.dominio !== null) notas[sid] = { v: gradeFromDominio(t.dominio), c: `Calculi: ${t.dominio} % de aciertos · ${t.estrellas} ★ · ${t.intentos} intentos` };
    }
    return { clave: `calculi:${tid}`, nombre: `Calculi · ${nombreDe(tid)}`, notas };
  });
}
