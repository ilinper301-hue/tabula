// Tabula · modelo de Ajustes (puro, sin DOM): secciones del índice, rutas y recordatorio de copia.

/** Secciones de Ajustes, en el orden del índice. `cards` son los títulos de las tarjetas de cada una. */
export const AJ_SECCIONES = [
  { id: 'perfil', label: 'Perfil', icon: 'grupos', desc: 'Tu nombre, grupo y centro', cards: ['Perfil'] },
  { id: 'apariencia', label: 'Apariencia', icon: 'moon', desc: 'Modo, color y barra inferior', cards: ['Apariencia', 'Barra inferior del móvil'] },
  { id: 'evaluacion', label: 'Evaluación', icon: 'cuaderno', desc: 'Cómo se califican los cuadernos nuevos', cards: ['Evaluación'] },
  { id: 'curso', label: 'Curso', icon: 'calendario', desc: 'Calendario escolar y nuevo curso', cards: ['Calendario escolar', 'Nuevo curso'] },
  { id: 'seguridad', label: 'Seguridad', icon: 'lock', desc: 'Bloqueo con PIN y acceso de asistente', cards: ['Bloqueo', 'Acceso de asistente'] },
  { id: 'cuenta', label: 'Cuenta y datos', icon: 'drive', desc: 'Sesión, estado de tus datos y copias', cards: ['Cuenta y sincronización', 'Estado de tus datos', 'Copia de seguridad'] },
  { id: 'ayuda', label: 'Ayuda', icon: 'help', desc: 'Guía rápida y datos de ejemplo', cards: ['Guía rápida'] },
];

/** Sección por su id (undefined si no existe). */
export const seccionAjustes = (id) => AJ_SECCIONES.find((s) => s.id === id);

/** Sección a la que pertenece una tarjeta, por su título (para la búsqueda). */
export const seccionDeTarjeta = (titulo) => (AJ_SECCIONES.find((s) => s.cards.includes(titulo)) || {}).id || null;

/**
 * Separa la ruta «ajustes/cuenta» en id de módulo y subsección. Una subsección desconocida se ignora.
 * @returns {{ id: string, sub: string|null }}
 */
export function splitRuta(path) {
  const [id, sub = ''] = String(path || '').split('/');
  return { id, sub: id === 'ajustes' && seccionAjustes(sub) ? sub : null };
}

const SEMANA = 7 * 86400000;

/**
 * Recordatorio de copia de seguridad para «Hoy»: null si no procede, o { dias, texto }.
 * Procede si no hay cuenta conectada, hay datos en el dispositivo, la última copia tiene más de 30 días
 * (o no existe) y no se ha silenciado en la última semana.
 */
export function recordatorioCopia({ conCuenta = false, hayDatos = false, ultimaCopia = null, silenciadoEn = 0, ahora = Date.now() } = {}) {
  if (conCuenta || !hayDatos) return null;
  if (ahora - (silenciadoEn || 0) < SEMANA) return null;
  const dias = ultimaCopia ? Math.floor((ahora - ultimaCopia) / 86400000) : null;
  if (dias !== null && dias <= 30) return null;
  return { dias, texto: dias === null ? 'Aún no tienes copia de seguridad.' : `Tu última copia es de hace ${dias} días.` };
}
