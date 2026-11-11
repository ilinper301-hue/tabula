// Tabula · pruebas de la seguridad de los datos (cierre de sesión, almacén, estado)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { conLimite, riesgoAlBorrar } from '../js/datos-model.js';

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
