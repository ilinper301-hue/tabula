// Tabula · pruebas de la seguridad de los datos (cierre de sesión, almacén, estado)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { conLimite, riesgoAlBorrar, decidirAlmacen, unirPorId, formatoBytes, textoCopia, debePedirPersistencia, filasEstado, planCombinar, nuevoDesde, MARGEN_SIN_ENVIAR } from '../js/datos-model.js';

test('conLimite: ok, error y tiempo agotado (nunca rechaza)', async () => {
  assert.equal(await conLimite(Promise.resolve(1), 50), 'ok');
  assert.equal(await conLimite(Promise.reject(new Error('x')), 50), 'error');
  assert.equal(await conLimite(new Promise(() => {}), 20), 'timeout');
  assert.equal(await conLimite(new Promise((r) => setTimeout(r, 5)), 200), 'ok');
});

test('cerrar sesión: solo es seguro borrar si todo está subido', () => {
  assert.deepEqual(riesgoAlBorrar({ online: true, status: 'synced', conectado: true, escrituras: 'ok', sinEnviar: false, archivos: 0 }), { seguro: true, cierto: false, motivos: [] });
  assert.equal(riesgoAlBorrar({ online: false, status: 'offline', escrituras: 'timeout' }).cierto, false, 'sin red no se sabe');
  assert.equal(riesgoAlBorrar({ escrituras: 'timeout' }).cierto, true);
  assert.equal(riesgoAlBorrar({ archivos: 2, online: false }).cierto, true);
  // Sin red
  const off = riesgoAlBorrar({ online: false, status: 'offline', escrituras: 'timeout' });
  assert.equal(off.seguro, false);
  assert.equal(off.motivos.length, 1, 'sin red se da un único motivo claro');
  assert.match(off.motivos[0], /conexión/);
  // Error de sincronización
  const err = riesgoAlBorrar({ status: 'error' });
  assert.equal(err.seguro, false);
  assert.match(err.motivos[0], /error/);
  // Escrituras que no terminan con red
  assert.equal(riesgoAlBorrar({ escrituras: 'timeout' }).seguro, false);
  assert.equal(riesgoAlBorrar({ escrituras: 'error' }).seguro, false);
  // Cambios hechos sin nube, cuenta aún enlazándose y archivos pendientes
  assert.equal(riesgoAlBorrar({ sinEnviar: true }).seguro, false);
  assert.equal(riesgoAlBorrar({ conectado: false, status: 'syncing' }).seguro, false);
  assert.match(riesgoAlBorrar({ archivos: 1 }).motivos[0], /1 archivo /);
  assert.match(riesgoAlBorrar({ archivos: 3 }).motivos[0], /3 archivos/);
});

test('cerrar sesión: sync.js comprueba antes de borrar y la interfaz no borra sin confirmación', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/sync.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function signOutAndClear'), src.indexOf('// ---------- Conexión de una cuenta'));
  assert.ok(fn.indexOf('pendingStatus()') > 0 && fn.indexOf('pendingStatus()') < fn.indexOf('_clearLocal'), 'se comprueba lo pendiente antes de borrar');
  assert.ok(fn.indexOf("return { hecho: false") < fn.indexOf('signOut(auth)'), 'si hay riesgo se sale antes de cerrar sesión');
  assert.match(src, /waitForPendingWrites\(db\)/);
  // Solo la caja de confirmación puede llamar a signOutAndClear
  const { readdirSync, statSync } = await import('node:fs');
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]));
  const root = new URL('../js', import.meta.url).pathname;
  const usan = walk(root).filter((f) => f.endsWith('.js') && /signOutAndClear\(/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1));
  assert.deepEqual(usan.sort(), ['sync.js', 'views/ajustes/cerrar-sesion.js']);
});

test('almacén: «IndexedDB no existe» es modo antiguo; «existe pero falló» avisa y, si había datos, bloquea', () => {
  assert.deepEqual(decidirAlmacen({ existe: false }), { modo: 'local', aviso: false });
  assert.deepEqual(decidirAlmacen({ existe: false, marca: 'idb', hayAjustes: true }), { modo: 'local', aviso: false });
  assert.deepEqual(decidirAlmacen({ existe: true, fallo: false, marca: 'idb' }), { modo: 'idb', aviso: false });
  // Falló y este dispositivo ya guardaba en IndexedDB → bloqueado
  assert.deepEqual(decidirAlmacen({ existe: true, fallo: true, marca: 'idb' }), { modo: 'bloqueado', aviso: true });
  // Instalación anterior a la marca: ya se usó y no queda nada en localStorage → estaba en IndexedDB
  assert.deepEqual(decidirAlmacen({ existe: true, fallo: true, marca: null, hayAjustes: true, hayColeccionesLS: false }), { modo: 'bloqueado', aviso: true });
  // Nunca usó IndexedDB (siempre falla aquí, o datos aún sin migrar) → localStorage, con aviso
  assert.deepEqual(decidirAlmacen({ existe: true, fallo: true, marca: 'local', hayAjustes: true }), { modo: 'local', aviso: true });
  assert.deepEqual(decidirAlmacen({ existe: true, fallo: true, marca: null, hayAjustes: true, hayColeccionesLS: true }), { modo: 'local', aviso: true });
  assert.deepEqual(decidirAlmacen({ existe: true, fallo: true, marca: null, hayAjustes: false }), { modo: 'local', aviso: true });
});

test('almacén: unirPorId conserva lo más reciente de cada lado', () => {
  const r = unirPorId([{ id: 'a', updatedAt: 5, v: 'idb' }, { id: 'b', updatedAt: 9, v: 'idb' }], [{ id: 'a', updatedAt: 7, v: 'ls' }, { id: 'b', updatedAt: 1, v: 'ls' }, { id: 'c', v: 'ls' }]);
  assert.deepEqual(Object.fromEntries(r.map((x) => [x.id, x.v])), { a: 'ls', b: 'idb', c: 'ls' });
});

// --- store.js con IndexedDB y localStorage simulados ---
function fakeLocalStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}
const idbQueFalla = { open() { const req = {}; setTimeout(() => { req.error = new Error('UnknownError'); req.onerror && req.onerror(); }, 0); return req; } };
let caso = 0;
async function storeCon({ idb, ls }) {
  if (idb === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = idb;
  globalThis.localStorage = fakeLocalStorage(ls);
  const { store } = await import(`../js/store.js?caso=${++caso}`);
  await store.ready();
  return store;
}

test('store: si IndexedDB falla y había datos allí, se bloquea y no se escribe nada', async () => {
  const store = await storeCon({ idb: idbQueFalla, ls: { 'tabula:v1:almacen': 'idb', 'tabula:v1:set:profile': '{"nombre":"I"}' } });
  assert.equal(store.almacen.bloqueado, true);
  assert.equal(store.almacen.modo, 'bloqueado');
  assert.match(store.almacen.error, /UnknownError/);
  const antes = JSON.stringify([...localStorage._m]);
  store.add('tasks', { title: 'no debe guardarse' });
  store.setSetting('profile', { nombre: 'X' });
  store._applyRemote('tasks', [{ id: 'r' }]);
  await store._clearLocal();
  assert.throws(() => store.importAll('{"app":"tabula","data":{}}'));
  assert.equal(JSON.stringify([...localStorage._m]), antes, 'localStorage queda intacto');
  // Reintentar sin éxito: sigue bloqueado
  assert.equal((await store.reintentar()).bloqueado, true);
  delete globalThis.indexedDB; delete globalThis.localStorage;
});

test('store: si IndexedDB falla pero nunca se usó aquí, sigue en localStorage con aviso', async () => {
  const store = await storeCon({ idb: idbQueFalla, ls: { 'tabula:v1:tasks': '[{"id":"t1","title":"vieja"}]', 'tabula:v1:set:profile': '{}' } });
  assert.deepEqual({ modo: store.almacen.modo, aviso: store.almacen.aviso, bloqueado: store.almacen.bloqueado }, { modo: 'local', aviso: true, bloqueado: false });
  assert.equal(store.list('tasks').length, 1, 'se ven los datos del modo antiguo');
  store.add('tasks', { title: 'nueva' });
  assert.equal(JSON.parse(localStorage.getItem('tabula:v1:tasks')).length, 2);
  assert.equal(localStorage.getItem('tabula:v1:almacen'), 'local');
  delete globalThis.indexedDB; delete globalThis.localStorage;
});

test('store: sin IndexedDB (modo antiguo) funciona en localStorage sin aviso', async () => {
  const store = await storeCon({ idb: undefined, ls: {} });
  assert.deepEqual({ modo: store.almacen.modo, aviso: store.almacen.aviso, bloqueado: store.almacen.bloqueado }, { modo: 'local', aviso: false, bloqueado: false });
  store.add('tasks', { title: 'a' });
  assert.equal(JSON.parse(localStorage.getItem('tabula:v1:tasks')).length, 1);
  delete globalThis.localStorage;
});

test('estado de los datos: tamaños y fecha de la última copia', () => {
  assert.equal(formatoBytes(0), '0 B');
  assert.equal(formatoBytes(340 * 1024), '340 KB');
  assert.equal(formatoBytes(12.4 * 1048576), '12,4 MB');
  assert.equal(formatoBytes(3 * 1048576), '3 MB');
  assert.equal(formatoBytes(250 * 1048576), '250 MB');
  assert.equal(formatoBytes(1.2 * 1073741824), '1,2 GB');
  assert.equal(formatoBytes(undefined), '—');
  assert.equal(textoCopia(null), 'Nunca');
  assert.equal(textoCopia(0), 'Hoy');
  assert.equal(textoCopia(1), 'Ayer');
  assert.equal(textoCopia(12), 'Hace 12 días');
});

test('estado de los datos: la persistencia se pide sola solo si no molesta', () => {
  assert.equal(debePedirPersistencia({ soportado: true, persistente: false, hayDatos: true, pregunta: false }), true);
  assert.equal(debePedirPersistencia({ soportado: true, persistente: true, hayDatos: true, pregunta: false }), false);
  assert.equal(debePedirPersistencia({ soportado: true, persistente: false, hayDatos: false, pregunta: false }), false);
  assert.equal(debePedirPersistencia({ soportado: true, persistente: false, hayDatos: true, pregunta: true }), false, 'Firefox preguntaría');
  assert.equal(debePedirPersistencia({ soportado: false, persistente: false, hayDatos: true, pregunta: false }), false);
});

test('estado de los datos: filas del panel y sus tonos', () => {
  const por = (filas) => Object.fromEntries(filas.map((f) => [f.clave, f]));
  // Sin cuenta y sin copia: lo más grave
  const a = por(filasEstado({ diasCopia: null, persistente: false, uso: 5 * 1048576, cuota: 1073741824, sync: { enabled: true, status: 'signed-out', user: null }, etiquetaSync: 'Sin sesión iniciada' }));
  assert.equal(a.copia.valor, 'Nunca'); assert.equal(a.copia.tono, 'mal');
  assert.equal(a.persistente.valor, 'No'); assert.equal(a.persistente.tono, 'aviso');
  assert.equal(a.espacio.valor, '5 MB de 1 GB'); assert.equal(a.espacio.tono, '');
  assert.equal(a.sync.valor, 'Sin sesión iniciada');
  assert.equal(a.pendientes, undefined, 'sin cuenta no hay nada que subir');
  // Con cuenta, todo en orden
  const user = { email: 'a@b.c' };
  const b = por(filasEstado({ diasCopia: 3, persistente: true, uso: 1, cuota: 100, sync: { enabled: true, status: 'synced', user }, etiquetaSync: 'Sincronizado', pendientes: { seguro: true, motivos: [] } }));
  assert.deepEqual([b.copia.tono, b.persistente.tono, b.sync.tono, b.pendientes.tono], ['ok', 'ok', 'ok', 'ok']);
  assert.equal(b.pendientes.valor, 'Ninguno');
  // Con cuenta: copia vieja es aviso (no grave), pendientes y poco espacio
  const c = por(filasEstado({ diasCopia: 45, persistente: null, uso: 90, cuota: 100, sync: { enabled: true, status: 'offline', user }, etiquetaSync: 'Sin conexión', pendientes: { seguro: false, cierto: false, motivos: ['No hay conexión.'] } }));
  assert.equal(c.copia.tono, 'aviso');
  assert.equal(c.persistente.valor, 'No disponible');
  assert.equal(c.espacio.tono, 'aviso');
  assert.equal(c.pendientes.valor, 'Sin confirmar'); assert.match(c.pendientes.detalle, /conexión/);
  assert.equal(por(filasEstado({ sync: { status: 'synced', user }, pendientes: { seguro: false, cierto: true, motivos: ['Hay 1 archivo de Documentos sin subir.'] } })).pendientes.valor, 'Sí');
  // Comprobando, error de sincronización y fallo al guardar
  const d = por(filasEstado({ sync: { enabled: true, status: 'error', user, error: 'Rechazado' }, etiquetaSync: 'Error de sincronización', pendientes: null, almacen: { guardadoFallido: true } }));
  assert.equal(d.pendientes.valor, 'Comprobando…');
  assert.equal(d.sync.tono, 'mal'); assert.equal(d.sync.detalle, 'Rechazado');
  assert.equal(d.almacen.tono, 'mal');
  // Sin datos del navegador
  assert.equal(por(filasEstado({})).espacio.valor, 'No disponible');
});

// ---------- Combinar con la nube lo hecho sin conexión ----------

test('combinar: lo borrado aquí sin conexión se borra de la nube (salvo que allí cambiara después)', () => {
  const remoto = new Map([['a', { id: 'a', updatedAt: 100 }], ['b', { id: 'b', updatedAt: 900 }], ['c', { id: 'c', updatedAt: 100 }]]);
  const plan = planCombinar({ local: [{ id: 'c', updatedAt: 100 }], remoto,
    borrados: [{ id: 'a', at: 500 }, { id: 'b', at: 500 }, { id: 'c', at: 500 }, { id: 'zz', at: 500 }], desde: 400 });
  assert.deepEqual(plan.borrar, ['a'], 'b se editó en otro dispositivo después; c se recuperó (Deshacer); zz ya no está');
  assert.deepEqual(plan.subir, []);
});

test('combinar: lo borrado en otro dispositivo no revive; lo nuevo sin conexión sí se sube', () => {
  const remoto = new Map([['x', { id: 'x', updatedAt: 100 }]]);
  const local = [
    { id: 'x', updatedAt: 600 },            // editado aquí sin conexión → se sube
    { id: 'viejo', updatedAt: 200 },        // ya estuvo en la nube y se borró desde otro sitio → no se sube
    { id: 'nuevo', createdAt: 700, updatedAt: 700 }, // creado sin conexión → se sube
    { id: 'sinFecha' },                     // sin fecha: se trata como antiguo
  ];
  assert.deepEqual(planCombinar({ local, remoto, desde: 500 }).subir.map((i) => i.id), ['x', 'nuevo']);
  // desde = 0 (primera vez, copia restaurada o datos antiguos): se sube todo lo que falte
  assert.deepEqual(planCombinar({ local, remoto, desde: 0 }).subir.map((i) => i.id), ['x', 'viejo', 'nuevo', 'sinFecha']);
});

test('combinar: «desde» se queda con el momento más antiguo, con margen, y 0 gana siempre', () => {
  assert.equal(nuevoDesde(null, 1e12), 1e12 - MARGEN_SIN_ENVIAR);
  assert.equal(nuevoDesde(5e11, 1e12), 5e11);
  assert.equal(nuevoDesde(null, 0), 0);
  assert.equal(nuevoDesde(5e11, 0), 0);
  assert.equal(nuevoDesde(0, 1e12), 0);
  assert.equal(nuevoDesde('basura', 1e12), 0);
  assert.ok(nuevoDesde(null, 5) >= 1, 'un cambio real nunca deja «desde» en 0');
});

test('store: sin conexión con la nube guarda marcas de borrado y «desde»; Deshacer las quita', async () => {
  const store = await storeCon({ idb: undefined, ls: { 'tabula:v1:set:syncUid': '"u1"' } });
  const antes = Date.now();
  const a = store.add('tasks', { title: 'a' });
  const b = store.add('tasks', { title: 'b' });
  assert.equal(store._isDirty(), true);
  assert.ok(store._dirtySince() <= antes - MARGEN_SIN_ENVIAR + 50 && store._dirtySince() > 0);
  const quitado = store.remove('tasks', a.id);
  store.remove('tasks', b.id);
  assert.deepEqual(store._borrados().tasks.map((x) => x.id), [a.id, b.id]);
  store.restore('tasks', quitado);
  assert.deepEqual(store._borrados().tasks.map((x) => x.id), [b.id]);
  assert.equal(store._hayBorrados(), true);
  assert.deepEqual(store.list('borrados'), [], 'las marcas no son una colección');
  // Restaurar una copia sin conexión: en la próxima conexión se sube todo lo que falte
  await store.importAll(store.exportAll());
  assert.equal(store._dirtySince(), 0);
  assert.equal(localStorage.getItem('tabula:v1:borrados') !== null, true, 'la copia no borra las marcas pendientes');
  store._clearDirty();
  assert.equal(store._isDirty(), false);
  assert.equal(store._hayBorrados(), false);
  assert.equal(localStorage.getItem('tabula:v1:dirtySince'), null);
  delete globalThis.localStorage;
});

test('store: sin cuenta asociada no se guardan marcas de borrado', async () => {
  const store = await storeCon({ idb: undefined, ls: {} });
  const a = store.add('tasks', { title: 'a' });
  store.remove('tasks', a.id);
  assert.equal(store._isDirty(), false);
  assert.equal(store._hayBorrados(), false);
  delete globalThis.localStorage;
});

test('sync: aplica el plan al reconectar y no borra datos de otra cuenta con cambios sin subir', () => {
  const src = readFileSync(new URL('../js/sync.js', import.meta.url), 'utf8');
  assert.match(src, /planCombinar\(/);
  assert.match(src, /batch\.delete\(ref\)/);
  assert.match(src, /getDocsFromServer/);
  assert.match(src, /_hayBorrados\(\)/);
  assert.match(src, /cambioCuenta:/);
  assert.match(src, /export async function resolverCambioCuenta/);
  // El borrado por cambio de cuenta va detrás de la comprobación
  const i = src.indexOf('_isDirty() || store._hayBorrados()'), j = src.indexOf('await store._clearLocal();\n  }');
  assert.ok(i > 0 && j > i, 'primero se comprueba, después se borra');
  const ajustes = readFileSync(new URL('../js/views/ajustes.js', import.meta.url), 'utf8');
  assert.match(ajustes, /cambioCuentaBox\(st\.cambioCuenta\)/);
});
