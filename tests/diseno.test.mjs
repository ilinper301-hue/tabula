// Tabula · pruebas del rediseño (fase 1): piezas comunes, cabecera única y guía en hoja.
// La comprobación en navegador (sin desplazamiento horizontal a 360 y 390 px) está en tests/desbordamiento.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { menuPosition, helpPlacement, joinMenuItems } from '../js/ui-kit.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => {
  const p = join(dir, f);
  return statSync(join(ROOT, p)).isDirectory() ? walk(p) : (f.endsWith('.js') ? [p] : []);
});

test('menú «⋯»: se abre debajo y alineado a la derecha del botón', () => {
  const rect = { top: 40, bottom: 84, left: 330, right: 374 };
  assert.deepEqual(menuPosition(rect, { width: 240, height: 200 }, { width: 390, height: 844 }), { left: 134, top: 90 });
});

test('menú «⋯»: nunca se sale por la izquierda ni por la derecha', () => {
  assert.equal(menuPosition({ top: 40, bottom: 84, left: 10, right: 54 }, { width: 240, height: 100 }, { width: 390, height: 844 }).left, 8);
  assert.equal(menuPosition({ top: 40, bottom: 84, left: 380, right: 420 }, { width: 240, height: 100 }, { width: 390, height: 844 }).left, 142);
});

test('menú «⋯»: si no cabe debajo, se abre encima; si tampoco, pegado al borde', () => {
  assert.equal(menuPosition({ top: 700, bottom: 744, left: 300, right: 344 }, { width: 200, height: 300 }, { width: 390, height: 844 }).top, 394);
  assert.equal(menuPosition({ top: 100, bottom: 144, left: 300, right: 344 }, { width: 200, height: 700 }, { width: 390, height: 760 }).top, 52);
});

test('«¿Cómo funciona?»: enlace si la cabecera no tiene acciones; si las tiene, dentro de «⋯»', () => {
  assert.equal(helpPlacement({ hasMenu: false, actions: 0 }), 'link');
  assert.equal(helpPlacement({ hasMenu: false, actions: 1 }), 'menu');
  assert.equal(helpPlacement({ hasMenu: true, actions: 2 }), 'menu');
});

test('menú «⋯»: separador solo entre lo propio y lo añadido, nunca al principio, al final ni repetido', () => {
  const a = { label: 'A' }, b = { label: 'B' }, g = { label: 'Guía' };
  assert.deepEqual(joinMenuItems([a, b], [g]), [a, b, '-', g]);
  assert.deepEqual(joinMenuItems([], [g]), [g]);
  assert.deepEqual(joinMenuItems([a, null], []), [a]);
  assert.deepEqual(joinMenuItems(['-', a, '-', '-', b, '-'], []), [a, '-', b]);
});

test('cabecera única: ninguna vista monta su cabecera a mano (todas usan pageHead)', () => {
  const files = [...walk('js/views'), 'js/app.js'];
  const bad = files.filter((f) => /class:\s*'page-head/.test(read(f))).map((f) => relative(ROOT, join(ROOT, f)));
  assert.deepEqual(bad, []);
  const routes = ['hoy', 'tareas', 'documentos', 'calendario', 'grupos', 'aula', 'tutoria', 'cuaderno', 'planificacion',
    'programas', 'codigos', 'ajustes', 'mas', 'encuestas/list', 'encuestas/editor', 'planificacion/programacion', 'cuaderno/informes'];
  for (const r of routes) assert.match(read(`js/views/${r}.js`), /pageHead\(\{/, `js/views/${r}.js no usa pageHead`);
});

test('cabecera única: solo acción principal y «⋯» (sin varias filas de botones)', () => {
  const kit = read('js/ui-kit.js');
  assert.match(kit, /class: 'ph-actions' \}, aside, primary \? primaryNode\(primary\) : null\)/);
  // Las cabeceras antiguas con varios botones ya no existen
  for (const [f, cls] of [['js/views/documentos.js', 'dc-head-actions'], ['js/views/cuaderno.js', 'cb-actions-top'], ['js/views/aula.js', 'au-head-tools'], ['js/views/hoy.js', 'hy-aula']]) {
    assert.ok(!read(f).includes(cls), `${f} aún monta «${cls}»`);
  }
});

test('menú «⋯» accesible: role=menu, menuitem, aria-expanded, Escape, flechas, Inicio/Fin y toque fuera', () => {
  const kit = read('js/ui-kit.js');
  for (const s of ["role: 'menu'", "role: 'menuitem'", "'aria-haspopup': 'menu'", "'aria-expanded'", "'Escape'", "'ArrowDown'", "'ArrowUp'", "'Home'", "'End'", "'Tab'", "'pointerdown'"]) {
    assert.ok(kit.includes(s), `falta ${s} en ui-kit.js`);
  }
  assert.match(kit, /export function openActionSheet\(title, actions/);
  assert.match(kit, /openSheet\(title,/);
});

test('guía: ya no hay tarjeta con «Entendido / Desactivar»; se abre en una hoja y respeta el ajuste', () => {
  const g = read('js/guide.js');
  assert.ok(!g.includes('Entendido') && !g.includes('Desactivar la guía') && !g.includes('gd-tip\''), 'quedan restos de la tarjeta antigua');
  assert.match(g, /openSheet\(HELP_LABEL/);
  assert.match(g, /loadGuide\(\)\.activa/);
  assert.match(read('js/views/ajustes/guia.js'), /refreshGuide\(\)/);
});

test('CSS: escala de espaciado, jerarquía de botones y lista sin tarjeta; lo nuevo solo con variables', () => {
  const css = read('css/app.css');
  for (let i = 1; i <= 6; i++) assert.match(css, new RegExp(`--s-${i}:`), `falta --s-${i}`);
  for (const sel of ['.btn-primary', '.btn-outline', '.btn-ghost', '.list ', '.menu ', '.ph-actions', '.action-item']) assert.ok(css.includes(sel), `falta ${sel}`);
  const rules = css.split('}').filter((r) => /\.(ph-|menu|list|action-)/.test(r));
  const hex = rules.filter((r) => /#[0-9a-f]{3,6}\b/i.test(r));
  assert.deepEqual(hex, [], 'colores fijos en reglas nuevas (usa variables de app.css)');
});
