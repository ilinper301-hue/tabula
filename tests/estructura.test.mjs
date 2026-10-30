// Tabula · pruebas de estructura: sintaxis, caché sin conexión, manifest y errores típicos de la interfaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const walk = (dir, ext) => readdirSync(join(ROOT, dir)).flatMap((f) => {
  const p = join(dir, f);
  return statSync(join(ROOT, p)).isDirectory() ? walk(p, ext) : (f.endsWith(ext) ? [p] : []);
});
const JS = walk('js', '.js');
const CSS = walk('css', '.css');

test('todos los archivos JavaScript tienen sintaxis válida', () => {
  for (const f of [...JS, 'sw.js']) execFileSync(process.execPath, ['--check', join(ROOT, f)]);
});

test('sw.js: la caché sin conexión incluye todos los archivos y solo archivos que existen', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/'\.\/([^'#]+)'/g)].map((m) => m[1]);
  for (const f of listed) assert.ok(existsSync(join(ROOT, f)), `sw.js menciona «${f}», que no existe`);
  for (const f of [...JS, ...CSS]) assert.ok(listed.includes(f), `«${f}» falta en la caché de sw.js (no funcionaría sin conexión)`);
});

test('manifest: JSON válido y con todos sus iconos', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const icons = [...m.icons, ...(m.shortcuts || []).flatMap((s) => s.icons || [])];
  for (const i of icons) assert.ok(existsSync(join(ROOT, i.src)), `falta el icono ${i.src}`);
});

/** Quita cadenas y el contenido de paréntesis/corchetes/llaves anidados, para mirar solo el nivel superior. */
function topLevel(arg) {
  let out = '', depth = 0, q = null;
  for (let i = 0; i < arg.length; i++) {
    const c = arg[i];
    if (q) { if (c === q && arg[i - 1] !== '\\') q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; if (!depth) out += '§'; continue; }
    if ('([{'.includes(c)) { if (!depth) out += c; depth++; continue; }
    if (')]}'.includes(c)) { depth--; if (!depth) out += c; continue; }
    if (!depth) out += c;
  }
  return out.trim();
}
/** Argumentos de primer nivel de cada llamada .replaceChildren( / .append( … */
function domCalls(src) {
  const out = [];
  const re = /\.(replaceChildren|append|prepend|before|after|replaceWith)\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, d = 1, cur = '', q = null; const args = [];
    for (; i < src.length && d; i++) {
      const c = src[i];
      if (q) { cur += c; if (c === q && src[i - 1] !== '\\') q = null; continue; }
      if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
      if ('([{'.includes(c)) d++;
      if (')]}'.includes(c)) d--;
      if (d === 1 && c === ',') { args.push(cur); cur = ''; continue; }
      if (d) cur += c;
    }
    args.push(cur);
    out.push({ line: src.slice(0, m.index).split('\n').length, args });
  }
  return out;
}

test('interfaz: nunca se pasa null a replaceChildren/append (se vería «null» en pantalla)', () => {
  const bad = [];
  for (const f of JS) {
    for (const { line, args } of domCalls(readFileSync(join(ROOT, f), 'utf8'))) {
      for (const a of args) {
        const t = topLevel(a);
        if (/^null$/.test(t) || /\?.*:\s*null$/.test(t) || (/&&/.test(t) && !/\?/.test(t))) bad.push(`${relative(ROOT, join(ROOT, f))}:${line}  ${a.trim().slice(0, 70)}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
