// Tabula · Perfil competencial (lógica pura).
// Une las notas por competencia específica (CE) de cada área con los descriptores operativos que el BOJA
// asigna a cada CE (Orden de 30/05/2023, Anexo II) y calcula el grado de desarrollo de cada competencia clave.
//
// Cálculo (transparente y explicable al docente):
//   descriptor (p. ej. CCL1) = media de las CE (de cualquier área) que lo tienen asignado y están evaluadas
//   competencia clave (p. ej. CCL) = media de sus descriptores evaluados
// Todas las CE pesan igual. Si un área no tiene criterios oficiales (códigos propios), sus CE se usan
// con los descriptores del BOJA según su número.

import { toLevel, wmean, round1 } from './grading.js';

export const CLAVES = [
  { id: 'CCL', nombre: 'Competencia en comunicación lingüística' },
  { id: 'CP', nombre: 'Competencia plurilingüe' },
  { id: 'STEM', nombre: 'Competencia matemática y en ciencia, tecnología e ingeniería' },
  { id: 'CD', nombre: 'Competencia digital' },
  { id: 'CPSAA', nombre: 'Competencia personal, social y de aprender a aprender' },
  { id: 'CC', nombre: 'Competencia ciudadana' },
  { id: 'CE', nombre: 'Competencia emprendedora' },
  { id: 'CCEC', nombre: 'Competencia en conciencia y expresión culturales' },
];
export const CLAVE_CORTA = {
  CCL: 'Lingüística', CP: 'Plurilingüe', STEM: 'Matemática y STEM', CD: 'Digital',
  CPSAA: 'Personal y aprender a aprender', CC: 'Ciudadana', CE: 'Emprendedora', CCEC: 'Expresión cultural',
};

/** "CPSAA3" → "CPSAA" */
export const claveOf = (desc) => (String(desc).match(/^[A-Z]+/) || [''])[0];

/** "CCL3, STEM4, CD1." → ['CCL3','STEM4','CD1'] */
export const parseDescriptores = (text) => String(text || '').split(/[,\s]+/).map((s) => s.replace(/\.$/, '').trim()).filter((s) => /^[A-Z]{2,5}\d$/.test(s));

/**
 * Mapa CE → descriptores para un área y curso, a partir de officialFor() de curriculo.js.
 * @returns { [ceNumber]: string[] }
 */
export function ceDescriptorMap(official) {
  const out = {};
  for (const ce of official?.competencias || []) out[String(ce.n)] = parseDescriptores(ce.descriptores);
  return out;
}

/**
 * Perfil competencial de un alumno.
 * @param areas [{ area, porCompetencia: { [ce]: nota0a10|null }, ceMap: { [ce]: descriptores[] } }]
 * @returns {
 *   claves: { [CCL]: { nota, nivel, descriptores: { [CCL1]: { nota, nivel, fuentes: [{area, ce, nota}] } } } },
 *   global: nota media de las claves evaluadas, evaluadas: nº de claves con dato
 * }
 */
export function competencyProfile(areas) {
  const desc = {}; // CCL1 -> [{area, ce, nota}]
  for (const a of areas || []) {
    for (const [ce, nota] of Object.entries(a.porCompetencia || {})) {
      if (typeof nota !== 'number' || !Number.isFinite(nota)) continue;
      for (const d of a.ceMap?.[ce] || []) (desc[d] ||= []).push({ area: a.area, ce: Number(ce), nota });
    }
  }
  const claves = {};
  for (const { id } of CLAVES) {
    const ds = Object.keys(desc).filter((d) => claveOf(d) === id).sort((x, y) => Number(x.slice(id.length)) - Number(y.slice(id.length)));
    const descriptores = {};
    for (const d of ds) {
      const nota = round1(wmean(desc[d].map((f) => ({ v: f.nota, w: 1 }))));
      descriptores[d] = { nota, nivel: toLevel(nota), fuentes: desc[d] };
    }
    const nota = round1(wmean(Object.values(descriptores).map((x) => ({ v: x.nota, w: 1 }))));
    claves[id] = { nota, nivel: toLevel(nota), descriptores };
  }
  const vals = Object.values(claves).map((c) => c.nota).filter((n) => n !== null);
  return { claves, global: round1(wmean(vals.map((v) => ({ v, w: 1 })))), evaluadas: vals.length };
}

/** Media del grupo por competencia clave: { CCL: nota|null, … } */
export function groupProfileMeans(profiles) {
  const out = {};
  for (const { id } of CLAVES) out[id] = round1(wmean(profiles.map((p) => ({ v: p.claves[id]?.nota ?? null, w: 1 }))));
  return out;
}

/**
 * Grado de adquisición para el informe de final de ciclo (Andalucía usa niveles):
 * Iniciado (<5), En desarrollo (5–<7), Adquirido (7–<9), Avanzado (≥9).
 */
export function gradoAdquisicion(nota) {
  if (typeof nota !== 'number' || !Number.isFinite(nota)) return null;
  if (nota < 5) return 'Iniciado';
  if (nota < 7) return 'En desarrollo';
  if (nota < 9) return 'Adquirido';
  return 'Avanzado';
}
