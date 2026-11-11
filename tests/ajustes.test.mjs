// Tabula · pruebas de la fase 4 del rediseño: Ajustes por secciones, «Más» en cuadrícula y recordatorio de copia en «Hoy».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AJ_SECCIONES, seccionAjustes, seccionDeTarjeta, splitRuta, recordatorioCopia } from '../js/ajustes-model.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const DIA = 86400000;

test('Ajustes: siete secciones con id único, icono y descripción', () => {
  assert.deepEqual(AJ_SECCIONES.map((s) => s.id), ['perfil', 'apariencia', 'evaluacion', 'curso', 'seguridad', 'cuenta', 'ayuda']);
  assert.equal(new Set(AJ_SECCIONES.map((s) => s.id)).size, AJ_SECCIONES.length);
  AJ_SECCIONES.forEach((s) => { assert.ok(s.label && s.icon && s.desc && s.cards.length, s.id); });
});

test('Ajustes: cada tarjeta pertenece a una sola sección', () => {
  const todas = AJ_SECCIONES.flatMap((s) => s.cards);
  assert.equal(new Set(todas).size, todas.length);
  assert.equal(seccionDeTarjeta('Estado de tus datos'), 'cuenta');
  assert.equal(seccionDeTarjeta('Bloqueo'), 'seguridad');
  assert.equal(seccionDeTarjeta('Nuevo curso'), 'curso');
  assert.equal(seccionDeTarjeta('No existe'), null);
  assert.equal(seccionAjustes('cuenta').label, 'Cuenta y datos');
  assert.equal(seccionAjustes('nada'), undefined);
});

test('rutas: «ajustes/cuenta» separa módulo y sección; una sección desconocida se ignora', () => {
  assert.deepEqual(splitRuta('ajustes/cuenta'), { id: 'ajustes', sub: 'cuenta' });
  assert.deepEqual(splitRuta('ajustes'), { id: 'ajustes', sub: null });
  assert.deepEqual(splitRuta('ajustes/zzz'), { id: 'ajustes', sub: null });
  assert.deepEqual(splitRuta('cuaderno/cuenta'), { id: 'cuaderno', sub: null });
  assert.deepEqual(splitRuta(''), { id: '', sub: null });
});

test('recordatorio de copia: solo sin cuenta, con datos, más de 30 días (o nunca) y sin silenciar', () => {
  const ahora = 100 * DIA;
  const base = { conCuenta: false, hayDatos: true, ultimaCopia: ahora - 45 * DIA, silenciadoEn: 0, ahora };
  assert.equal(recordatorioCopia(base).dias, 45);
  assert.match(recordatorioCopia(base).texto, /hace 45 días/);
  assert.match(recordatorioCopia({ ...base, ultimaCopia: null }).texto, /Aún no tienes copia/);
  assert.equal(recordatorioCopia({ ...base, ultimaCopia: ahora - 30 * DIA }), null);
  assert.equal(recordatorioCopia({ ...base, conCuenta: true }), null);
  assert.equal(recordatorioCopia({ ...base, hayDatos: false }), null);
  assert.equal(recordatorioCopia({ ...base, silenciadoEn: ahora - 2 * DIA }), null);
  assert.ok(recordatorioCopia({ ...base, silenciadoEn: ahora - 8 * DIA }));
});

test('estructura: el router entiende #/ajustes/<seccion>, Más usa cuadrícula y el aviso flotante de copia ya no existe', () => {
  assert.match(read('js/app.js'), /splitRuta/);
  assert.doesNotMatch(read('js/app.js'), /backupReminder/);
  assert.match(read('js/views/mas.js'), /more-grid/);
  assert.doesNotMatch(read('js/views/mas.js'), /more-desc/);
  assert.match(read('js/views/hoy.js'), /recordatorioCopia/);
  assert.match(read('sw.js'), /ajustes-model\.js/);
});
