// Tabula · Currículo oficial: criterios de evaluación de Andalucía por área y curso.
// Los datos (≈200 KB) se cargan solo cuando hacen falta.

const AREA_KEY = {
  'Conocimiento del Medio Natural, Social y Cultural': 'CMN',
  'Educación Artística': 'EAR',
  'Educación Física': 'EFI',
  'Educación en Valores Cívicos y Éticos': 'VCE',
  'Lengua Castellana y Literatura': 'LCL',
  'Lengua Extranjera (Inglés)': 'LEX',
  'Matemáticas': 'MAT',
  'Segunda Lengua Extranjera': 'LEX',
};

let cache = null;
/** Carga los datos oficiales (una sola vez). */
export async function loadCurriculo() {
  if (!cache) cache = import('./data/criterios-andalucia.js');
  return cache;
}

export const cicloOf = (curso) => Math.ceil(Number(curso) / 2);

/**
 * Criterios oficiales de un área para un curso (1–6), o null si no los hay.
 * @param data  módulo cargado con loadCurriculo()
 * @returns { area, curso, fuente, nota, criterios:[{codigo, descripcion, competencia}], competencias:[{n, texto, descriptores}] }
 */
export function officialFor(data, area, curso) {
  const key = AREA_KEY[area];
  const n = Number(curso);
  if (!key || !(n >= 1 && n <= 6) || !data?.CURRICULO?.[key]) return null;
  const A = data.CURRICULO[key];
  let c = n, nota = '';
  // Segunda Lengua Extranjera (tercer ciclo): parte de los elementos del primer ciclo de Primera Lengua Extranjera
  if (area === 'Segunda Lengua Extranjera') {
    if (n < 5) return null;
    c = n - 4;
    nota = 'Según el BOJA, la Segunda Lengua Extranjera parte de los criterios del primer ciclo de Primera Lengua Extranjera (en centros plurilingües, de los del ciclo correspondiente).';
  }
  const list = A.criterios[c];
  if (!list || !list.length) return null;
  const comps = A.competencias[cicloOf(c)] || [];
  return {
    area, curso: n, fuente: data.FUENTE, nota,
    criterios: list.map(([codigo, descripcion]) => ({ codigo, descripcion, competencia: Number(codigo.split('.')[0]) })),
    competencias: comps.map(([num, texto, descriptores]) => ({ n: num, texto, descriptores })),
  };
}

/** ¿Hay criterios oficiales para esta área? (sin cargar los datos) */
export const hasOfficial = (area, curso) => !!AREA_KEY[area] && Number(curso) >= (area === 'Segunda Lengua Extranjera' ? 5 : 1) && Number(curso) <= 6
  && !(AREA_KEY[area] === 'VCE' && Number(curso) !== 6);

/**
 * Añade criterios oficiales a una lista existente sin duplicar códigos.
 * @returns { criterios, added, skipped }
 */
export function mergeOfficial(existing, official, makeId) {
  const have = new Set((existing || []).map((c) => String(c.codigo || '').trim().replace(/\.$/, '')));
  const out = [...(existing || [])];
  let added = 0, skipped = 0;
  for (const o of official) {
    if (have.has(o.codigo)) { skipped++; continue; }
    out.push({ id: makeId(), codigo: o.codigo, descripcion: o.descripcion, peso: 1 });
    have.add(o.codigo); added++;
  }
  return { criterios: out, added, skipped };
}
