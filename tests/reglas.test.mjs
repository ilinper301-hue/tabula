// Comprobaciones de estructura de firestore.rules (no sustituyen al simulador de la consola de Firebase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const txt = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const sinComentarios = txt.replace(/\/\/.*$/gm, '');

test('reglas: llaves y paréntesis equilibrados', () => {
  for (const [a, c] of [['{', '}'], ['(', ')'], ['[', ']']]) {
    assert.equal(sinComentarios.split(a).length, sinComentarios.split(c).length, `${a} ${c}`);
  }
});

test('reglas: ninguna regla abierta a todo el mundo', () => {
  assert.doesNotMatch(sinComentarios, /if\s+true/);
  assert.doesNotMatch(sinComentarios, /match\s+\/\{document=\*\*\}/);
  for (const linea of sinComentarios.split(';')) {
    if (/allow\s/.test(linea)) assert.match(linea, /\sif\s/, linea.trim());
  }
});

test('reglas: están los bloques de todas las apps', () => {
  for (const ruta of ['/barri/{uid}', '/lectori/{uid}', '/calculo/{uid}', '/lexico/{uid}',
    '/apps/tabula/users/{uid}', '/apps/charta/fichas/{id}']) {
    assert.ok(sinComentarios.includes('match ' + ruta), ruta);
  }
});

test('reglas de Lexi: solo el dueño, sin anónimos, campos y tamaño limitados', () => {
  const ini = txt.indexOf('// ---------- Lexi ----------');
  const fin = txt.indexOf('// ---------- fin Lexi ----------');
  assert.ok(ini > 0 && fin > ini);
  const b = txt.slice(ini, fin);
  assert.match(b, /request\.auth\.uid == uid/);
  assert.match(b, /sign_in_provider != 'anonymous'/);
  assert.match(b, /hasOnly\(\['meta', 'ts', 'v'\]\)/);
  assert.match(b, /hasOnly\(\['d', 'mt', 'v'\]\)/);
  assert.match(b, /meta\.size\(\) <= 20000/);
  assert.match(b, /d\.size\(\) <= 300000/);
  // todas las reglas del bloque pasan por dueno()
  const allows = b.match(/allow [^;]+;/g);
  assert.equal(allows.length, 4);
  for (const a of allows) assert.match(a, /if dueno\(\)/);
});
