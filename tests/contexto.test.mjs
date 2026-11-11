// Tabula · pruebas del rediseño (fase 3): barra de contexto compartida por Cuaderno y Planificación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evPorFecha, evId, evShort, evLong, contextParts, contextAria, areaOptions, pickArea, recall, remember, _resetShared,
} from '../js/contexto-model.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const ALL = ['Lengua', 'Matemáticas', 'Medio', 'Inglés', 'Artística'];

test('evaluación por fecha: sep–dic 1.ª, ene–mar 2.ª, abr–ago 3.ª', () => {
  assert.equal(evPorFecha(new Date(2026, 8, 10)), '1');
  assert.equal(evPorFecha(new Date(2026, 11, 22)), '1');
  assert.equal(evPorFecha(new Date(2027, 0, 8)), '2');
  assert.equal(evPorFecha(new Date(2027, 2, 31)), '2');
  assert.equal(evPorFecha(new Date(2027, 3, 1)), '3');
  assert.equal(evPorFecha(new Date(2027, 7, 1)), '3');
});

test('evId: acepta número o texto; «final» solo donde se permite', () => {
  assert.equal(evId(2), '2');
  assert.equal(evId(' 3 '), '3');
  assert.equal(evId('final'), 'final');
  assert.equal(evId('final', { final: false, fallback: '1' }), '1');
  assert.equal(evId('7', { fallback: '2' }), '2');
  assert.equal(evId(null, { fallback: '3' }), '3');
  assert.ok(['1', '2', '3'].includes(evId(undefined)));
});

test('textos de la barra: corto en la fila, largo para el lector de pantalla', () => {
  assert.equal(evShort('1'), '1.ª ev.');
  assert.equal(evShort('final'), 'Final');
  assert.equal(evLong('2'), '2.ª evaluación');
  assert.equal(evLong('final'), 'Evaluación final');
  assert.deepEqual(contextParts({ group: '1º Demo', area: 'Matemáticas', ev: '1' }), ['1º Demo', 'Matemáticas', '1.ª ev.']);
  assert.deepEqual(contextParts({ group: '1º Demo', area: '', ev: null }), ['1º Demo']);
  assert.equal(contextAria({ group: '1º Demo', area: 'Matemáticas', ev: 'final' }),
    'Cambiar grupo, área y evaluación. Ahora: 1º Demo, Matemáticas, Evaluación final');
});

test('áreas de la hoja: primero las que tienen datos (en orden oficial), luego el resto, sin repetir', () => {
  const o = areaOptions(ALL, ['Inglés', 'Matemáticas', 'Inglés']);
  assert.deepEqual(o.map((x) => x.area), ['Matemáticas', 'Inglés', 'Lengua', 'Medio', 'Artística']);
  assert.deepEqual(o.map((x) => x.has), [true, true, false, false, false]);
  assert.deepEqual(areaOptions(ALL, []).map((x) => x.has), [false, false, false, false, false]);
  // Un área con datos que no está en la lista oficial no se pierde
  assert.equal(areaOptions(ALL, ['Taller']).at(0).area, 'Taller');
});

test('al cambiar de grupo: se conserva el área si tiene datos; si no, la primera con datos; si no hay, la actual', () => {
  assert.equal(pickArea({ current: 'Inglés', withData: ['Matemáticas', 'Inglés'], all: ALL }), 'Inglés');
  assert.equal(pickArea({ current: 'Medio', withData: ['Inglés', 'Matemáticas'], all: ALL }), 'Matemáticas');
  assert.equal(pickArea({ current: 'Medio', withData: [], all: ALL }), 'Medio');
  assert.equal(pickArea({ current: null, withData: [], all: ALL }), 'Lengua');
});

test('la última elección se comparte entre vistas y no se borra con valores vacíos', () => {
  _resetShared();
  assert.deepEqual(recall(), { groupId: null, area: null, ev: null });
  remember({ groupId: 'g1', area: 'Matemáticas', ev: 2 });
  remember({ area: null, ev: undefined });
  assert.deepEqual(recall(), { groupId: 'g1', area: 'Matemáticas', ev: '2' });
  const copy = recall(); copy.area = 'x';
  assert.equal(recall().area, 'Matemáticas', 'recall devuelve una copia');
});

test('Cuaderno y Planificación usan la barra de contexto (sin desplegable de grupo, píldoras de área ni selector de trimestre)', () => {
  for (const f of ['js/views/cuaderno.js', 'js/views/planificacion.js']) {
    const s = read(f);
    assert.match(s, /contextBar\(\{/, `${f} no usa contextBar`);
    assert.match(s, /openContextSheet\(\{/, `${f} no abre la hoja de contexto`);
    assert.match(s, /from '\.\.\/contexto-model\.js'/, `${f} no comparte la última elección`);
    assert.ok(!/h\('select'/.test(s), `${f} aún tiene un desplegable`);
    for (const old of ['cb-areas', 'cb-area-add', 'pl-areas', 'pl-area-add', 'openAreaPicker', "'Evaluación')"]) {
      assert.ok(!s.includes(old), `${f} aún monta «${old}»`);
    }
  }
  // La franja de Planificación sigue a la barra: sin su propio selector de evaluación
  const tl = read('js/views/planificacion/timeline.js');
  assert.ok(!tl.includes('segmented(') && !tl.includes('tlEv'), 'la línea de tiempo aún tiene su propio selector');
});

test('Cuaderno: «⋯» con Configurar, Importar, Exportar, Informes y tipo de tabla; un solo segmentado', () => {
  const s = read('js/views/cuaderno.js');
  for (const t of ['Configurar cuaderno', 'Importar notas de Calculi', 'Exportar a CSV', 'Informes del grupo', 'Anotar con niveles', 'Anotar con notas']) {
    assert.ok(s.includes(t), `falta «${t}» en el menú`);
  }
  assert.ok(!s.includes('cb-informes-btn'), 'Informes sigue fuera del menú');
  assert.equal((s.match(/segmented\(\[/g) || []).length, 3, 'deben quedar: vista (Actividades/Criterios/Competencias) y los dos de crear cuaderno');
  assert.match(s, /\['actividades', 'Actividades'\], \['criterios', 'Criterios'\], \['competencias', 'Competencias'\]/);
});

test('Planificación: «Nueva situación» como acción principal y segmentado Situaciones / Programación', () => {
  const s = read('js/views/planificacion.js');
  assert.match(s, /primary: group \? \{ label: 'Nueva situación'/);
  assert.match(s, /viewTabs\('situaciones'/);
  assert.match(read('js/views/planificacion/model.js'), /if \(ev\) p\.set\('ev'/);
});

test('barra de contexto: botón accesible que abre una hoja; archivos nuevos en la caché', () => {
  const ui = read('js/views/contexto.js');
  for (const t of ["'aria-haspopup': 'dialog'", "'aria-label': contextAria", "'aria-pressed'", 'openSheet(', 'Listo']) assert.ok(ui.includes(t), `falta ${t}`);
  const sw = read('sw.js');
  for (const f of ['./js/contexto-model.js', './js/views/contexto.js']) assert.ok(sw.includes(`'${f}'`), `${f} no está en sw.js`);
  const css = read('css/app.css');
  const rules = css.split('}').filter((r) => /\.ctx-/.test(r));
  assert.ok(rules.length > 5, 'faltan estilos .ctx-');
  assert.deepEqual(rules.filter((r) => /#[0-9a-f]{3,6}\b/i.test(r)), [], 'colores fijos en .ctx- (usa variables)');
});
