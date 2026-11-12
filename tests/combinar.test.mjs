// Tabula · «Imprimir juntos» (varios documentos en un solo trabajo de impresión)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCombine, chartaOpciones, chartaPages, move, blanksAfter, combineSummary, scopeFichaCss, fichaPagesFromHeight } from '../js/combine-model.js';

test('combinar: qué documentos se pueden unir', () => {
  assert.ok(canCombine({ tipo: 'application/pdf', fileId: 'f1' }));
  assert.ok(canCombine({ tipo: 'image/png', fileId: 'f1' }));
  assert.ok(canCombine({ tipo: 'text/html', fileId: 'f1' }));
  assert.ok(!canCombine({ charta: { id: 'x' }, titulo: 'Ficha' })); // sin composición no se puede dibujar
  assert.ok(canCombine({ charta: { id: 'x', comp: { actividades: [{ tipo: 'sumar.h20' }] } }, titulo: 'Ficha' }));
  assert.ok(!canCombine({ enlace: 'https://x', titulo: 'Web' }));
  assert.ok(!canCombine({ nombreArchivo: 'a.docx', fileId: 'f1' }));
  assert.ok(!canCombine(null));
});

test('combinar: mover en la lista', () => {
  assert.deepEqual(move(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(move(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(move(['a', 'b'], 0, -1), ['a', 'b']);
});

test('combinar: dos fichas de una página van delante y detrás del mismo folio', () => {
  assert.deepEqual(blanksAfter([1, 1]), [0, 0]);
  assert.deepEqual(combineSummary([1, 1]), { paginas: 2, blancas: 0, hojasDobleCara: 1, hojasUnaCara: 2 });
});

test('combinar: «cada documento en hoja nueva» rellena con blancas solo tras los impares', () => {
  assert.deepEqual(blanksAfter([1, 1], { nuevaHoja: true }), [1, 0]);
  assert.deepEqual(blanksAfter([3, 2, 1], { nuevaHoja: true }), [1, 0, 0]);
  assert.deepEqual(combineSummary([3, 2, 1], { nuevaHoja: true }), { paginas: 7, blancas: 1, hojasDobleCara: 4, hojasUnaCara: 7 });
});

test('combinar: el CSS de una ficha se adapta al shadow root', () => {
  const css = '@page{size:A4;margin:14mm} html,body{margin:0} body{font-size:15pt} .tb-head span{flex:1} tbody td{x:1} body.grande h1{y:2}';
  const out = scopeFichaCss(css);
  assert.ok(!out.includes('@page'));
  assert.match(out, /:host,\.tb-body\{margin:0\}/);
  assert.match(out, /\.tb-body\{font-size:15pt\}/);
  assert.match(out, /tbody td/);
  assert.match(out, /\.tb-body\.grande h1/);
  assert.match(out, /\.tb-head span/);
});

test('combinar: páginas aproximadas de una ficha por su altura', () => {
  assert.equal(fichaPagesFromHeight(0), 1);
  assert.equal(fichaPagesFromHeight(900), 1);
  assert.equal(fichaPagesFromHeight(1500), 2);
});

test('Charta: composición → opciones de generar() (una variante, sin nombres)', () => {
  const a = (t) => ({ tipo: t, params: {} });
  const o = chartaOpciones({ actividades: [a('x'), a('y'), a('z')], paginas: [2, 1], semilla: 7, titulo: 'Sumas', bn: true, fuente: 'fredoka', grande: true });
  assert.equal(o.semilla, 7); assert.equal(o.bn, true);
  assert.deepEqual(o.opciones.paginas.map((p) => p.actividades.length), [2, 1]);
  assert.equal(o.opciones.variantes, 1);
  assert.deepEqual(o.opciones.presentacion, { color: false, fuente: 'fredoka', letraGrande: true });
  assert.equal(o.opciones.titulo, 'Sumas');
  // Sin `paginas`, o con cuentas que no suman: una sola página; semilla por defecto 1
  const p = chartaOpciones({ actividades: [a('x'), a('y')], paginas: [1] });
  assert.equal(p.opciones.paginas.length, 1); assert.equal(p.semilla, 1);
  assert.equal(chartaOpciones({ actividades: [] }), null);
  assert.equal(chartaOpciones(null), null);
  assert.equal(chartaPages({ charta: { comp: { actividades: [a('x'), a('y'), a('z')], paginas: [2, 1] } } }), 2);
  assert.equal(chartaPages({ charta: { comp: { actividades: [a('x')] } } }), 1);
});
