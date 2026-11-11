// Tabula · contexto compartido de Cuaderno y Planificación (grupo · área · evaluación).
// Lógica pura, sin DOM ni almacén: se prueba con Node. La interfaz está en js/views/contexto.js.
//
// La evaluación se guarda siempre como texto: '1' | '2' | '3' | 'final'.
// Planificación no tiene «final»: allí se usa la evaluación en curso.

export const EV_IDS = ['1', '2', '3', 'final'];

/** Evaluación por la fecha: sep–dic → 1.ª, ene–mar → 2.ª, abr–ago → 3.ª. */
export function evPorFecha(d = new Date()) {
  const m = d.getMonth();
  return m >= 8 ? '1' : m <= 2 ? '2' : '3';
}

/** Normaliza una evaluación (número o texto). Sin «final» si `final` es false. */
export function evId(v, { final = true, fallback = null } = {}) {
  const s = v === null || v === undefined ? '' : String(v).trim().toLowerCase();
  if (EV_IDS.includes(s) && (final || s !== 'final')) return s;
  return fallback === null ? evPorFecha() : fallback;
}

/** Texto corto para la barra: «1.ª ev.» o «Final». */
export const evShort = (id) => (id === 'final' ? 'Final' : `${id}.ª ev.`);

/** Texto largo para lectores de pantalla y hojas: «1.ª evaluación» o «Evaluación final». */
export const evLong = (id) => (id === 'final' ? 'Evaluación final' : `${id}.ª evaluación`);

/** Trozos de la barra de contexto, sin huecos: ['1º Demo', 'Matemáticas', '1.ª ev.']. */
export function contextParts({ group = '', area = '', ev = null } = {}) {
  return [group, area, ev ? evShort(ev) : ''].filter((x) => x && String(x).trim());
}

/** Etiqueta accesible completa de la barra. */
export function contextAria({ group = '', area = '', ev = null } = {}) {
  const now = [group, area, ev ? evLong(ev) : ''].filter(Boolean).join(', ');
  return `Cambiar grupo, área y evaluación. Ahora: ${now || 'sin elegir'}`;
}

/**
 * Áreas para la hoja: primero las que ya tienen datos (cuaderno o situaciones), en el orden oficial,
 * y luego el resto. Las que tienen datos pero no están en la lista oficial van al final de su bloque.
 * @returns [{ area, has }]
 */
export function areaOptions(all = [], withData = []) {
  const ord = (a) => { const i = all.indexOf(a); return i < 0 ? all.length : i; };
  const has = [...new Set(withData)].filter(Boolean).sort((a, b) => ord(a) - ord(b));
  const rest = all.filter((a) => !has.includes(a));
  return [...has.map((area) => ({ area, has: true })), ...rest.map((area) => ({ area, has: false }))];
}

/**
 * Área al cambiar de grupo: se conserva si el grupo nuevo la tiene con datos; si no, la primera con datos
 * (en el orden oficial); si no tiene ninguna, se conserva la actual (o la primera de la lista).
 */
export function pickArea({ current = null, withData = [], all = [] } = {}) {
  if (current && withData.includes(current)) return current;
  const first = areaOptions(all, withData).find((o) => o.has);
  if (first) return first.area;
  return current || all[0] || null;
}

// ---------- Última elección (compartida mientras dura la sesión) ----------
const shared = { groupId: null, area: null, ev: null };

export function recall() { return { ...shared }; }

export function remember(patch = {}) {
  for (const k of Object.keys(shared)) if (patch[k] !== undefined && patch[k] !== null) shared[k] = String(patch[k]);
  return recall();
}

/** Solo para pruebas. */
export function _resetShared() { shared.groupId = shared.area = shared.ev = null; }
