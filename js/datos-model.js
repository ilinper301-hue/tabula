// Tabula · seguridad de los datos: lógica pura (sin DOM ni Firebase), probada con Node.

/**
 * Espera una promesa con tiempo límite. Nunca rechaza.
 * @returns 'ok' (terminó) | 'timeout' (no terminó a tiempo) | 'error' (falló)
 */
export function conLimite(promesa, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve('timeout'), ms);
    Promise.resolve(promesa).then(
      () => { clearTimeout(t); resolve('ok'); },
      () => { clearTimeout(t); resolve('error'); });
  });
}

/**
 * ¿Es seguro borrar los datos de este dispositivo (al cerrar sesión)?
 * Solo lo es si todo lo hecho aquí está ya en la nube.
 * @param e.online        hay red (navigator.onLine)
 * @param e.status        estado de la sincronización (sync.js)
 * @param e.conectado     la cuenta terminó de enlazarse (los cambios se están enviando a la nube)
 * @param e.escrituras    resultado de esperar las escrituras pendientes: 'ok' | 'timeout' | 'error'
 * @param e.sinEnviar     hay cambios hechos sin conexión con la nube aún por combinar (store._isDirty)
 * @param e.archivos      n.º de archivos de Documentos pendientes de subir
 * @returns { seguro, motivos: [texto…] }
 */
export function riesgoAlBorrar({ online = true, status = 'synced', conectado = true, escrituras = 'ok', sinEnviar = false, archivos = 0 } = {}) {
  const motivos = [];
  if (!online || status === 'offline') motivos.push('No hay conexión: no puedo comprobar que tus últimos cambios estén en la nube.');
  if (status === 'error') motivos.push('La sincronización ha dado un error: puede haber cambios que no se han guardado en tu cuenta.');
  if (!conectado && status !== 'error') motivos.push('Tu cuenta todavía se está conectando con la nube.');
  if (escrituras === 'timeout' && online && status !== 'offline') motivos.push('Hay cambios que no han terminado de subirse (la conexión va lenta o está cortada).');
  if (escrituras === 'error') motivos.push('No he podido comprobar si quedan cambios por subir.');
  if (sinEnviar) motivos.push('Hay cambios hechos sin conexión que aún no se han combinado con tu cuenta.');
  if (archivos > 0) motivos.push(archivos === 1 ? 'Hay 1 archivo de Documentos sin subir.' : `Hay ${archivos} archivos de Documentos sin subir.`);
  return { seguro: motivos.length === 0, motivos };
}

/**
 * Decide dónde guardar al arrancar, según si IndexedDB existe y si ha fallado al abrirse.
 * Distingue «no existe» (modo antiguo: localStorage, sin aviso) de «existe pero falló»:
 * si este dispositivo ya guardaba en IndexedDB, los datos siguen allí aunque ahora no se puedan leer,
 * así que se BLOQUEA la escritura (seguir en localStorage vacío parecería una app sin datos y los cambios se perderían).
 * @param e.existe            typeof indexedDB !== 'undefined'
 * @param e.fallo             existe pero no se pudo abrir o leer
 * @param e.marca             último modo usado con éxito en este dispositivo: 'idb' | 'local' | null (aún sin marca)
 * @param e.hayAjustes        hay ajustes de uso guardados (la app ya se ha usado aquí)
 * @param e.hayColeccionesLS  hay colecciones en localStorage (datos del modo antiguo)
 * @returns { modo: 'idb' | 'local' | 'bloqueado', aviso: boolean }
 */
export function decidirAlmacen({ existe, fallo = false, marca = null, hayAjustes = false, hayColeccionesLS = false } = {}) {
  if (!existe) return { modo: 'local', aviso: false };
  if (!fallo) return { modo: 'idb', aviso: false };
  // Sin marca (instalaciones anteriores a ella): si la app ya se usó y no quedan datos en localStorage, estaban en IndexedDB
  const usabaIdb = marca === 'idb' || (marca == null && hayAjustes && !hayColeccionesLS);
  return usabaIdb ? { modo: 'bloqueado', aviso: true } : { modo: 'local', aviso: true };
}

/** Une dos listas de elementos por id: gana el modificado más recientemente. */
export function unirPorId(a = [], b = []) {
  const m = new Map(a.map((x) => [x.id, x]));
  for (const x of b) {
    const y = m.get(x.id);
    if (!y || (x.updatedAt || 0) > (y.updatedAt || 0)) m.set(x.id, x);
  }
  return [...m.values()];
}
