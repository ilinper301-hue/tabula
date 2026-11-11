// Tabula · pruebas de la seguridad de los datos (cierre de sesión, almacén, estado)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { conLimite, riesgoAlBorrar, decidirAlmacen, unirPorId } from '../js/datos-model.js';

test('conLimite: ok, error y tiempo agotado (nunca rechaza)', async () => {
  assert.equal(await conLimite(Promise.resolve(1), 50), 'ok');
  assert.equal(await conLimite(Promise.reject(new Error('x')), 50), 'error');
  assert.equal(await conLimite(new Promise(() => {}), 20), 'timeout');
  assert.equal(await conLimite(new Promise((r) => setTimeout(r, 5)), 200), 'ok');
});

test('cerrar sesión: solo es seguro borrar si todo está subido', () => {
  assert.deepEqual(riesgoAlBorrar({ online: true, status: 'synced', conectado: true, escrituras: 'ok', sinEnviar: false, archivos: 0 }), { seguro: true, motivos: [] });
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
