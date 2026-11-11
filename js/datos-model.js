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
 * @returns { seguro, cierto, motivos: [texto…] }
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
  // cierto = se sabe que hay algo sin subir (no solo que no se ha podido comprobar)
  const cierto = sinEnviar || archivos > 0 || (escrituras === 'timeout' && online && status !== 'offline');
  return { seguro: motivos.length === 0, cierto, motivos };
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

// ---------- Panel «Estado de tus datos» ----------

/** Tamaño legible en español: 0 B, 340 KB, 12,4 MB, 1,2 GB. */
export function formatoBytes(n) {
  if (typeof n !== 'number' || !isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  const dec = (x) => (x >= 100 ? String(Math.round(x)) : x.toFixed(1).replace('.', ',').replace(/,0$/, ''));
  if (n < 1073741824) return `${dec(n / 1048576)} MB`;
  return `${dec(n / 1073741824)} GB`;
}

/** Texto de la última copia a partir de daysSinceBackup(). */
export function textoCopia(dias) {
  if (dias === null || dias === undefined) return 'Nunca';
  if (dias <= 0) return 'Hoy';
  return dias === 1 ? 'Ayer' : `Hace ${dias} días`;
}

/**
 * ¿Pedir al arrancar que el navegador conserve los datos (navigator.storage.persist)?
 * Solo si no molesta: hay algo que proteger, aún no está concedido y el navegador no pregunta al usuario
 * (Firefox muestra un permiso: allí se pide desde Ajustes, con un botón).
 */
export function debePedirPersistencia({ soportado, persistente, hayDatos, pregunta }) {
  return !!soportado && !persistente && !!hayDatos && !pregunta;
}

/**
 * Filas del panel. Cada una: { clave, etiqueta, valor, tono: 'ok' | 'aviso' | 'mal' | '', detalle }.
 * @param e.diasCopia    daysSinceBackup(): número o null (nunca)
 * @param e.persistente  true | false | null (el navegador no lo dice)
 * @param e.uso, e.cuota bytes de navigator.storage.estimate() (o null)
 * @param e.sync         { enabled, status, user } de getSyncState()
 * @param e.etiquetaSync texto del estado (SYNC_LABELS[status])
 * @param e.pendientes   { seguro, cierto, motivos } de pendingStatus(), o null mientras se comprueba
 * @param e.almacen      store.almacen
 */
export function filasEstado({ diasCopia = null, persistente = null, uso = null, cuota = null, sync = {}, etiquetaSync = '', pendientes = null, almacen = {} } = {}) {
  const conCuenta = !!(sync && sync.user);
  const filas = [];

  // Sin cuenta, la copia es la única red de seguridad: más de 30 días es grave. Con cuenta, solo un aviso.
  const vieja = diasCopia === null || diasCopia > 30;
  filas.push({
    clave: 'copia', etiqueta: 'Última copia', valor: textoCopia(diasCopia),
    tono: !vieja ? 'ok' : (conCuenta ? 'aviso' : 'mal'),
    detalle: !vieja ? '' : (conCuenta ? 'Conviene descargar una de vez en cuando, aunque sincronices.' : 'Tus datos solo están en este dispositivo: haz una copia.'),
  });

  filas.push(persistente === null
    ? { clave: 'persistente', etiqueta: 'Almacenamiento protegido', valor: 'No disponible', tono: '', detalle: 'Este navegador no lo indica.' }
    : persistente
      ? { clave: 'persistente', etiqueta: 'Almacenamiento protegido', valor: 'Sí', tono: 'ok', detalle: 'El navegador no borrará tus datos por falta de espacio.' }
      : { clave: 'persistente', etiqueta: 'Almacenamiento protegido', valor: 'No', tono: 'aviso', detalle: 'Si el dispositivo se queda sin espacio, el navegador podría borrar tus datos. Instalar Tabula en la pantalla de inicio suele activarlo.' });

  const lleno = typeof uso === 'number' && typeof cuota === 'number' && cuota > 0 && uso / cuota > 0.8;
  filas.push({
    clave: 'espacio', etiqueta: 'Espacio usado',
    valor: typeof uso === 'number' ? (typeof cuota === 'number' && cuota > 0 ? `${formatoBytes(uso)} de ${formatoBytes(cuota)}` : formatoBytes(uso)) : 'No disponible',
    tono: lleno ? 'aviso' : '', detalle: lleno ? 'Queda poco espacio para Tabula en este dispositivo.' : '',
  });

  if (almacen && (almacen.guardadoFallido || almacen.aviso)) {
    filas.push({ clave: 'almacen', etiqueta: 'Guardado en el dispositivo', valor: almacen.guardadoFallido ? 'Fallando' : 'Modo reducido', tono: 'mal',
      detalle: almacen.guardadoFallido ? 'No puedo guardar los últimos cambios. No cierres Tabula y haz una copia.' : 'El navegador no deja abrir el almacén principal.' });
  }

  const st = (sync && sync.status) || 'off';
  filas.push({
    clave: 'sync', etiqueta: 'Sincronización', valor: etiquetaSync || '—',
    tono: st === 'synced' ? 'ok' : st === 'error' ? 'mal' : st === 'offline' ? 'aviso' : '',
    detalle: st === 'error' ? (sync.error || '') : !conCuenta && st !== 'loading' ? 'Sin cuenta, los datos no salen de este dispositivo.' : '',
  });

  if (conCuenta) {
    filas.push(pendientes === null
      ? { clave: 'pendientes', etiqueta: 'Cambios por subir', valor: 'Comprobando…', tono: '', detalle: '' }
      : pendientes.seguro
        ? { clave: 'pendientes', etiqueta: 'Cambios por subir', valor: 'Ninguno', tono: 'ok', detalle: '' }
        : { clave: 'pendientes', etiqueta: 'Cambios por subir', valor: pendientes.cierto ? 'Sí' : 'Sin confirmar', tono: 'aviso', detalle: (pendientes.motivos || []).join(' ') });
  }
  return filas;
}

// ---------- Combinar con la nube los cambios hechos sin conexión ----------

/** Margen de seguridad (ms) al marcar desde cuándo hay cambios sin enviar: protege de pequeños ajustes del reloj. */
export const MARGEN_SIN_ENVIAR = 10 * 60 * 1000;

/**
 * Qué hacer con una colección al volver a conectar con la nube.
 * - Lo local más reciente que lo de la nube se sube.
 * - Lo local que NO está en la nube: si se creó o cambió en el periodo sin conexión (desde `desde`), se sube;
 *   si es anterior, es que la nube ya lo tuvo y se borró desde otro dispositivo: no se sube (y desaparecerá de aquí).
 *   Con desde = 0 (primera vez de la cuenta aquí, copia restaurada o datos antiguos sin marca) se sube todo lo que falte.
 * - Lo borrado aquí sin conexión (marcas de borrado) se borra de la nube, salvo que en la nube se haya
 *   cambiado después del borrado o que aquí se haya recuperado (Deshacer).
 * @param e.local     items de este dispositivo
 * @param e.remoto    Map id -> item de la nube
 * @param e.borrados  [{ id, at }] marcas de borrado de esta colección
 * @param e.desde     ms (reloj de este dispositivo) desde los que hay cambios sin enviar; 0 = subir todo lo que falte
 * @returns { subir: [item], borrar: [id] }
 */
export function planCombinar({ local = [], remoto = new Map(), borrados = [], desde = 0 } = {}) {
  const subir = [];
  const borrar = [];
  const aqui = new Set();
  for (const item of local) {
    aqui.add(item.id);
    const r = remoto.get(item.id);
    const t = item.updatedAt || item.createdAt || 0;
    if (r) { if (t > (r.updatedAt || 0)) subir.push(item); }
    else if (!desde || t >= desde) subir.push(item);
  }
  for (const b of borrados) {
    if (!b || aqui.has(b.id)) continue;
    const r = remoto.get(b.id);
    if (r && (r.updatedAt || 0) <= (b.at || 0)) borrar.push(b.id);
  }
  return { subir, borrar };
}

/**
 * Nuevo «desde» al hacer un cambio sin conexión con la nube.
 * @param previo  «desde» guardado (número), o null si no había nada pendiente
 * @param at      momento del cambio (ms); 0 = hay que subir todo lo que falte (p. ej. copia restaurada)
 */
export function nuevoDesde(previo, at) {
  const cand = at > 0 ? Math.max(1, at - MARGEN_SIN_ENVIAR) : 0;
  if (previo === null || previo === undefined) return cand;
  const p = Number(previo);
  return Number.isFinite(p) ? Math.max(0, Math.min(p, cand)) : 0;
}
