// Tabula · modelo de la navegación (puro, sin DOM): secciones, bloques del menú y barra inferior del móvil.

/** Secciones principales (el orden y la agrupación están en NAV_BLOCKS). */
export const SECTIONS = {
  hoy: { label: 'Hoy', icon: 'hoy', desc: 'Tu día: horario, tareas y avisos' },
  tareas: { label: 'Tareas', icon: 'tareas', desc: 'Lo pendiente, con fechas y etiquetas', count: true },
  calendario: { label: 'Calendario', icon: 'calendario', desc: 'Semana, mes y horario' },
  aula: { label: 'En clase', icon: 'aula', desc: 'Temporizador, al azar, grupos y ruido' },
  grupos: { label: 'Grupos', icon: 'grupos', desc: 'Alumnado, asistencia y observaciones' },
  tutoria: { label: 'Tutoría', icon: 'tutoria', desc: 'Familias, reuniones y atención a la diversidad' },
  cuaderno: { label: 'Cuaderno', icon: 'cuaderno', desc: 'Notas, criterios e informes' },
  planificacion: { label: 'Planificación', icon: 'planificacion', desc: 'Situaciones de aprendizaje y sesiones' },
  documentos: { label: 'Documentos', icon: 'documentos', desc: 'Fichas, archivos y cola de impresión' },
  programas: { label: 'Planes y programas', icon: 'programas', desc: 'Diario de coordinación y memorias' },
  encuestas: { label: 'Encuestas', icon: 'encuestas', desc: 'Pregunta a tus compañeros con un enlace' },
  codigos: { label: 'Códigos', icon: 'lock', desc: 'Libros digitales, impresora, wifi…' },
};

export const AJUSTES = { id: 'ajustes', label: 'Ajustes', icon: 'ajustes', desc: 'Perfil, cuenta, evaluación y copias' };

export const NAV_BLOCKS = [
  { id: 'dia', label: 'Día a día', items: ['hoy', 'tareas', 'calendario', 'aula'] },
  { id: 'alumnado', label: 'Alumnado', items: ['grupos', 'tutoria'] },
  { id: 'evaluacion', label: 'Evaluación', items: ['cuaderno', 'planificacion'] },
  { id: 'centro', label: 'Centro', items: ['documentos', 'codigos', 'programas', 'encuestas'] },
];

/** Apps hermanas de Tabula (se abren en otra pestaña). */
export const APPS_AMIGAS = [
  { id: 'barri', nombre: 'Barri', desc: 'Mates con barras (modelo de Singapur)', url: 'https://ilinper301-hue.github.io/Barri/', icono: 'icons/apps/barri.png' },
  { id: 'calculi', nombre: 'Calculi', desc: 'Trucos de cálculo mental', url: 'https://ilinper301-hue.github.io/Calculi/', icono: 'icons/apps/calculi.png' },
  { id: 'lectori', nombre: 'Lectori', desc: 'Aprender a leer con el método fonológico', url: 'https://ilinper301-hue.github.io/Lectori/', icono: 'icons/apps/lectori.png' },
  { id: 'fori', nombre: 'Fori', desc: 'Pizarra y asamblea para la PDI', url: 'https://ilinper301-hue.github.io/Fori/', icono: 'icons/apps/fori.png' },
];

export const DEFAULT_MOBILE = ['hoy', 'tareas', 'calendario', 'grupos'];
export const MOBILE_SLOTS = 4;

/** Valida el ajuste `navMovil`: exactamente 4 secciones distintas y conocidas; si no, la barra de serie. */
export function normalizeMobileNav(value) {
  if (!Array.isArray(value)) return [...DEFAULT_MOBILE];
  const ids = [];
  for (const id of value) if (SECTIONS[id] && !ids.includes(id)) ids.push(id);
  return ids.length === MOBILE_SLOTS ? ids : [...DEFAULT_MOBILE];
}
