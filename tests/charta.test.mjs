// Tabula · pruebas de la integración con Charta (lógica pura)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARTA_URL, b64urlCodificar, b64urlDecodificar, urlCrearFicha, urlAbrirFicha,
  leerEntradaCharta, documentoDeCharta, mismaFichaCharta,
} from '../js/charta.js';
import { kindOf, canPrint, KINDS } from '../js/documents.js';

const payload = (o) => `?charta=${b64urlCodificar(JSON.stringify(o))}`;
const ok = { v: 1, id: 'abc123', titulo: 'Sumas hasta 20 · año 1º', tipos: ['sumar.h20'], comp: { n: 10, semilla: 7 } };

test('base64url: tildes, ñ y emojis, sin «=» ni + /', () => {
  for (const t of ['Ficha de niños: añadir y quitar ¿Qué tal? ✓', 'a', 'ab', 'abc', '???>>>~~~']) {
    const c = b64urlCodificar(t);
    assert.match(c, /^[A-Za-z0-9_-]*$/);
    assert.equal(b64urlDecodificar(c), t);
  }
});

test('urlCrearFicha: parámetros opcionales', () => {
  assert.equal(urlCrearFicha(), `${CHARTA_URL}?desde=tabula`);
  assert.equal(urlCrearFicha({ groupId: 'g1', sesionId: 's1', tareaId: 't1' }), '../Charta/?desde=tabula&grupo=g1&sesion=s1&tarea=t1');
  assert.equal(urlCrearFicha({ tareaId: 't1' }), '../Charta/?desde=tabula&tarea=t1');
});

test('urlAbrirFicha: con id y sin id (comp en base64url), con grupo', () => {
  assert.equal(urlAbrirFicha({ charta: { id: 'f9', comp: {} } }), '../Charta/?ficha=f9&desde=tabula');
  assert.equal(urlAbrirFicha({ charta: { id: 'f9' }, groupId: 'g2' }), '../Charta/?ficha=f9&grupo=g2&desde=tabula');
  assert.equal(urlAbrirFicha({ charta: { id: 'f9' }, groupId: 'g2' }, { groupId: 'g3' }), '../Charta/?ficha=f9&grupo=g3&desde=tabula');
  const u = urlAbrirFicha({ charta: { comp: { t: 'ñ' } } }, { groupId: 'g1' });
  const q = new URLSearchParams(u.split('?')[1]);
  assert.deepEqual(JSON.parse(b64urlDecodificar(q.get('comp'))), { t: 'ñ' });
  assert.equal(q.get('grupo'), 'g1'); assert.equal(q.get('desde'), 'tabula'); assert.equal(q.get('ficha'), null);
});

test('leerEntradaCharta: válido e inválidos → null', () => {
  assert.deepEqual(leerEntradaCharta(payload(ok)), ok);
  assert.equal(leerEntradaCharta(''), null);
  assert.equal(leerEntradaCharta('?otra=1'), null);
  assert.equal(leerEntradaCharta('?charta=@@@'), null);
  assert.equal(leerEntradaCharta(`?charta=${b64urlCodificar('no es json')}`), null);
  assert.equal(leerEntradaCharta(payload({ ...ok, v: 2 })), null);
  assert.equal(leerEntradaCharta(payload({ ...ok, titulo: 5 })), null);
  assert.equal(leerEntradaCharta(payload({ ...ok, titulo: 'x'.repeat(201) })), null);
  assert.equal(leerEntradaCharta(payload({ ...ok, comp: 'x' })), null);
  assert.equal(leerEntradaCharta(payload({ ...ok, comp: [] })), null);
  assert.equal(leerEntradaCharta(payload({ ...ok, comp: { x: 'y'.repeat(20000) } })), null);
});

test('documentoDeCharta: forma de documento de Tabula', () => {
  assert.deepEqual(documentoDeCharta({ ...ok, grupo: 'g1' }), {
    titulo: ok.titulo, tipo: 'charta', nombreArchivo: '', carpeta: 'Charta', etiquetas: [], groupId: 'g1',
    area: 'Matemáticas', notas: '', favorito: false, charta: { id: 'abc123', tipos: ['sumar.h20'], comp: ok.comp },
  });
  const sin = documentoDeCharta({ v: 1, titulo: ' Hola ', comp: {} });
  assert.equal(sin.titulo, 'Hola'); assert.equal(sin.groupId, null);
  assert.deepEqual(sin.charta, { tipos: [], comp: {} });
});

test('mismaFichaCharta: por id o por comp', () => {
  const d = documentoDeCharta(ok);
  assert.ok(mismaFichaCharta(d, ok));
  assert.ok(!mismaFichaCharta(d, { ...ok, id: 'otro' }));
  const sinId = { v: 1, titulo: 'A', comp: { a: 1 } };
  assert.ok(mismaFichaCharta(documentoDeCharta(sinId), sinId));
  assert.ok(!mismaFichaCharta(documentoDeCharta(sinId), { ...sinId, comp: { a: 2 } }));
  assert.ok(!mismaFichaCharta({ titulo: 'pdf', tipo: 'application/pdf' }, ok));
});

test('kindOf: un documento de Charta es «charta» y se puede imprimir', () => {
  const d = documentoDeCharta(ok);
  assert.equal(kindOf(d), 'charta');
  assert.equal(KINDS.charta.label, 'Ficha de Charta');
  assert.ok(canPrint(d));
  assert.equal(kindOf({ ...d, enlace: 'https://x.es', nombreArchivo: 'a.pdf' }), 'charta');
});
