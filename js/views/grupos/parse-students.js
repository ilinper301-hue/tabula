// Tabula · Grupos · lectura de listas de alumnado pegadas desde Séneca, Excel o un documento.
// Función pura (sin DOM) para poder probarla con Node.

/** Partículas que forman parte de un apellido compuesto ("de la Torre", "del Río"). */
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'da', 'do', 'di', 'van', 'von', 'san', 'santa']);

/** Pone en mayúscula inicial cada palabra si el texto venía TODO EN MAYÚSCULAS o todo en minúsculas. */
function tidyCase(text) {
  const hasUpper = text !== text.toLowerCase();
  const hasLower = text !== text.toUpperCase();
  if (hasUpper && hasLower) return text; // ya tiene mayúsculas y minúsculas: respetar
  return text.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|El|Y|E|Da|Do|Di)\b(?!$)/g, (w, _p, off) => (off === 0 ? w : w.toLowerCase()));
}

/** Separa "Nombre Apellido1 Apellido2" (con partículas) en {nombre, apellidos}. */
function splitNatural(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { nombre: words[0] || '', apellidos: '' };
  if (words.length === 2) return { nombre: words[0], apellidos: words[1] };
  // Se toman, desde el final, hasta dos apellidos (cada uno con sus partículas delante).
  let end = words.length;
  let surnames = 0;
  while (surnames < 2 && end > 1) {
    end -= 1; // palabra principal del apellido
    while (end > 1 && PARTICLES.has(words[end - 1].toLowerCase())) end -= 1; // partículas previas
    surnames += 1;
  }
  return { nombre: words.slice(0, end).join(' '), apellidos: words.slice(end).join(' ') };
}

/**
 * Interpreta un texto con un alumno por línea.
 * Formatos: "Apellidos, Nombre" · "Apellidos<TAB>Nombre" (o ';') · "Nombre Apellido1 Apellido2".
 * Ignora líneas vacías, recorta espacios y quita numeración inicial ("1.", "2)", "3 -").
 * @returns {{nombre:string, apellidos:string, raw:string, formato:'coma'|'tabulador'|'natural'}[]}
 */
export function parseStudentList(text) {
  const out = [];
  for (const rawLine of String(text ?? '').split(/\r\n|\r|\n/)) {
    let line = rawLine.replace(/ /g, ' ').trim();
    if (!line) continue;
    line = line.replace(/^\d{1,3}\s*[.)\-:]\s*/, '').replace(/^\d{1,3}\s+(?=\D)/, '').trim();
    if (!line) continue;

    let apellidos = '', nombre = '', formato;
    if (/[\t;]/.test(line)) {
      const cols = line.split(/[\t;]/).map((c) => c.trim()).filter(Boolean);
      formato = 'tabulador';
      apellidos = cols[0] || '';
      nombre = cols[1] || '';
      if (!nombre) { ({ nombre, apellidos } = splitNatural(apellidos)); formato = 'natural'; }
    } else if (line.includes(',')) {
      const [a, ...rest] = line.split(',');
      formato = 'coma';
      apellidos = a.trim();
      nombre = rest.join(' ').trim();
      if (!nombre) { ({ nombre, apellidos } = splitNatural(apellidos)); formato = 'natural'; }
    } else {
      formato = 'natural';
      ({ nombre, apellidos } = splitNatural(line));
    }
    nombre = tidyCase(nombre.replace(/\s+/g, ' ').trim());
    apellidos = tidyCase(apellidos.replace(/\s+/g, ' ').trim());
    if (!nombre && !apellidos) continue;
    if (!nombre) { nombre = apellidos; apellidos = ''; }
    out.push({ nombre, apellidos, raw: rawLine.trim(), formato });
  }
  return out;
}

/** Clave de orden alfabético por apellidos y nombre (ignora tildes y mayúsculas). */
export const sortKey = (s) => `${s.apellidos || ''}\u0000${s.nombre || ''}`;
export const compareStudents = (a, b) => sortKey(a).localeCompare(sortKey(b), 'es', { sensitivity: 'base' });
