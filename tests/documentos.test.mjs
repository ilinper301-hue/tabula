// Tabula · Documentos, fase 2 del rediseño: lógica pura (filtros, selección, «Imprimir lo de hoy») y estructura.
// La comprobación en navegador (sin desplazamiento horizontal con hojas y menús abiertos) está en tests/desbordamiento.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeFilters, clearFilter, toggleOrdered, queueItemsOf, SORTS, DEFAULT_SORT, filterDocs } from '../js/documents.js';
import { printTodayPlan } from '../js/combine-model.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('filtros: sin nada activo no hay píldoras (la búsqueda no cuenta)', () => {
  assert.deepEqual(activeFilters({ q: 'sumas', sort: DEFAULT_SORT, favoritos: false, carpeta: '', etiqueta: '', kind: '', groupId: '' }), []);
  assert.deepEqual(activeFilters({}), []);
});

test('filtros: una píldora por filtro activo, en orden fijo y con texto legible', () => {
  const f = { sort: 'titulo', favoritos: true, carpeta: 'Lengua', etiqueta: 'repaso', kind: 'pdf', groupId: 'g1' };
  const pills = activeFilters(f, { group: (id) => (id === 'g1' ? '1º A' : '') });
  assert.deepEqual(pills.map((p) => p.key), ['sort', 'favoritos', 'carpeta', 'etiqueta', 'kind', 'groupId']);
  assert.deepEqual(pills.map((p) => p.label), ['Orden: Título (A–Z)', 'Favoritos', 'Carpeta: Lengua', 'Etiqueta: repaso', 'Tipo: PDF', 'Grupo: 1º A']);
  // Grupo que ya no existe: no se muestra un id
  assert.equal(activeFilters({ groupId: 'zz' }, { group: () => '' })[0].label, 'Grupo: otro grupo');
});

test('filtros: quitar uno deja los demás; «all» quita todos y el orden, pero no la búsqueda', () => {
  const f = { q: 'otoño', sort: 'impresos', favoritos: true, carpeta: 'Lengua', etiqueta: 'x', kind: 'pdf', groupId: 'g1' };
  assert.deepEqual(clearFilter(f, 'carpeta'), { ...f, carpeta: '' });
  assert.deepEqual(clearFilter(f, 'favoritos'), { ...f, favoritos: false });
  assert.deepEqual(clearFilter(f, 'sort'), { ...f, sort: DEFAULT_SORT });
  assert.deepEqual(clearFilter(f, 'all'), { q: 'otoño', sort: DEFAULT_SORT, favoritos: false, carpeta: '', etiqueta: '', kind: '', groupId: '' });
  assert.deepEqual(clearFilter(f, 'desconocido'), f);
  assert.notEqual(clearFilter(f, 'carpeta'), f, 'devuelve un objeto nuevo');
  assert.ok(SORTS.some(([v]) => v === DEFAULT_SORT));
});

test('filtros: el resultado coincide con lo que dicen las píldoras', () => {
  const docs = [
    { id: 'a', titulo: 'A', carpeta: 'Lengua', etiquetas: ['repaso'], favorito: true, tipo: 'application/pdf', fileId: '1' },
    { id: 'b', titulo: 'B', carpeta: 'Lengua', etiquetas: [], tipo: 'text/html', fileId: '2' },
    { id: 'c', titulo: 'C', carpeta: '', etiquetas: ['repaso'], tipo: 'application/pdf', fileId: '3' },
  ];
  assert.deepEqual(filterDocs(docs, { carpeta: 'Lengua', kind: 'pdf' }).map((d) => d.id), ['a']);
  assert.deepEqual(filterDocs(docs, clearFilter({ carpeta: 'Lengua', kind: 'pdf' }, 'kind')).map((d) => d.id).sort(), ['a', 'b']);
});

test('selección: el orden de los toques es el orden de impresión; tocar otra vez quita', () => {
  let sel = [];
  sel = toggleOrdered(sel, 'b'); sel = toggleOrdered(sel, 'a'); sel = toggleOrdered(sel, 'c');
  assert.deepEqual(sel, ['b', 'a', 'c']);
  sel = toggleOrdered(sel, 'a');
  assert.deepEqual(sel, ['b', 'c']);
  sel = toggleOrdered(sel, 'a');
  assert.deepEqual(sel, ['b', 'c', 'a']);
});

test('eliminar varios: también lo suyo en la cola (y solo eso)', () => {
  const cola = [{ id: 'i1', documentoId: 'a' }, { id: 'i2', documentoId: 'b' }, { id: 'i3', documentoId: 'a' }, { id: 'i4', documentoId: 'z' }];
  assert.deepEqual(queueItemsOf(['a', 'b'], cola).map((i) => i.id), ['i1', 'i2', 'i3']);
  assert.deepEqual(queueItemsOf([], cola), []);
});

test('«Imprimir lo de hoy»: preguntar solo si hay más de un documento combinable', () => {
  const byId = {
    pdf: { id: 'pdf', tipo: 'application/pdf', fileId: '1' },
    ficha: { id: 'ficha', tipo: 'text/html', fileId: '2' },
    img: { id: 'img', tipo: 'image/png', fileId: '3' },
    web: { id: 'web', enlace: 'https://x' },
    word: { id: 'word', nombreArchivo: 'a.docx', fileId: '4' },
    charta: { id: 'charta', charta: { id: 'c' } },
    chartaComp: { id: 'chartaComp', charta: { id: 'c2', comp: { actividades: [{ tipo: 'sumar.h20' }] } } },
  };
  const it = (id, documentoId) => ({ id, documentoId });
  // Varios combinables → elegir «Uno a uno» o «Todo junto»
  let p = printTodayPlan([it(1, 'pdf'), it(2, 'ficha'), it(3, 'web')], byId);
  assert.equal(p.mode, 'choose');
  assert.deepEqual(p.docIds, ['pdf', 'ficha']);
  assert.deepEqual(p.items.map((i) => i.id), [1, 2]);
  // Uno solo (aunque esté dos veces, p. ej. para dos grupos) → directo
  p = printTodayPlan([it(1, 'img'), it(2, 'img'), it(3, 'word')], byId);
  assert.equal(p.mode, 'direct');
  assert.equal(p.items.length, 2);
  // Nada imprimible desde Tabula (enlaces, Word, Charta) → nada; se cuentan las de Charta para avisar
  p = printTodayPlan([it(1, 'web'), it(2, 'word'), it(3, 'charta'), it(4, 'borrado')], byId);
  assert.equal(p.mode, 'none');
  assert.equal(p.charta, 1);
  assert.equal(printTodayPlan([], byId).mode, 'none');
  // Una ficha de Charta con composición se une a los demás
  p = printTodayPlan([it(1, 'pdf'), it(2, 'chartaComp')], byId);
  assert.equal(p.mode, 'choose');
  assert.deepEqual(p.docIds, ['pdf', 'chartaComp']);
  assert.deepEqual(p.items.map((i) => i.id), [1]); // «Uno a uno» no incluye la de Charta
  assert.equal(p.charta, 0);
  // Una sola de Charta sin más: nada que combinar
  assert.equal(printTodayPlan([it(1, 'chartaComp')], byId).mode, 'none');
});

// ---------- Estructura de la interfaz ----------

test('Añadir: una sola acción principal que abre una hoja con 5 opciones de iconos distintos', () => {
  const v = read('js/views/documentos.js');
  assert.match(v, /primary: \{ label: 'Añadir', icon: 'plus', run: openAdd/);
  const sheet = v.slice(v.indexOf('openActionSheet(\'Añadir\''), v.indexOf("], { className: 'dc-add-sheet' }"));
  const labels = [...sheet.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Subir archivo', 'Google Drive', 'Enlace', 'Crear ficha (Charta)', 'Pegar de Claude']);
  const icons = [...sheet.matchAll(/icon: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(new Set(icons).size, 5, 'cada opción con su propio icono');
  assert.equal([...sheet.matchAll(/desc: '/g)].length, 5, 'cada opción con una línea de explicación');
  // El «⋯» ya no repite formas de añadir; ofrece «Seleccionar» (para teclado y lector de pantalla)
  const menu = v.slice(v.indexOf('menu: () => ['), v.indexOf('tabs, status, panel'));
  assert.match(menu, /label: 'Seleccionar'/);
  assert.ok(!/Pegar de Claude|Drive|Charta|enlace/i.test(menu));
  // Arrastrar, pegar y «Compartir → Tabula» siguen
  for (const s of ["addEventListener('drop'", "addEventListener('paste'", 'importShared(']) assert.ok(v.includes(s), `falta ${s}`);
  // El estado vacío usa el mismo botón
  assert.match(read('js/views/documentos/library.js'), /onclick: ctx\.add \}, icon\('plus', 17\), 'Añadir'\)/);
});

test('Biblioteca: buscador + «Filtros»; sin desplegable de orden, sin impresora ni fila fija de píldoras', () => {
  const l = read('js/views/documentos/library.js');
  assert.ok(!l.includes("'aria-label': 'Ordenar por'") && !l.includes('dc-sort'), 'queda el desplegable de orden');
  assert.ok(!l.includes('dc-sel-btn') && !l.includes('dc-pill-select'), 'quedan la impresora o las píldoras-desplegable');
  assert.match(l, /'Filtros'/);
  assert.match(l, /activeFilters\(/);
  assert.match(l, /openSheet\('Filtros'/);
  // Selección: pulsación larga sin menú del sistema, sin perder el toque normal ni el desplazamiento
  for (const s of ["'pointerdown'", "'pointermove'", "'pointercancel'", "'contextmenu'", 'suppressClick', 'MOVE_TOLERANCE']) assert.ok(l.includes(s), `falta ${s}`);
  assert.match(l, /const SEL_ACTIONS = \[/);
  assert.match(l, /'Imprimir juntos'/);
  assert.match(l, /'Sí, eliminar'/);
});

test('Ficha: principal + «Programar» + «⋯»; metadatos plegados en «Detalles»', () => {
  const d = read('js/views/documentos/detail.js');
  assert.match(d, /h\('div', \{ class: 'dc-detail-actions' \}, mainBtn, queueBtn, moreBtn\)/);
  assert.match(d, /h\('details', \{ class: 'dc-details' \}/);
  assert.ok(!/details', \{[^}]*open/.test(d), '«Detalles» debe ir plegado por defecto');
  for (const s of ["label: 'Abrir'", "label: 'Descargar'", "label: 'Ver en Drive'", "label: 'Eliminar'"]) assert.ok(d.includes(s), `falta ${s} en «⋯»`);
});

test('Para imprimir: un único «Imprimir lo de hoy» y cada fila con una acción + «⋯»', () => {
  const q = read('js/views/documentos/queue.js');
  assert.match(q, /'Imprimir lo de hoy'/);
  assert.ok(!q.includes("'Imprimir todo lo de hoy'") && !q.includes("'Imprimir juntos')"), 'quedan los dos botones antiguos');
  assert.match(q, /openActionSheet\('Imprimir lo de hoy'/);
  for (const s of ["'Uno a uno'", "'Todo junto (doble cara)'", "'Marcar como impreso'", "'Editar'", "'Quitar de la cola'", '¿Has impreso', "label: 'Deshacer'"]) assert.ok(q.includes(s), `falta ${s}`);
  assert.ok(!q.includes('dc-mark') && !q.includes('dc-row-actions'), 'quedan los botones sueltos de cada fila');
});

test('CSS de Documentos: sin restos de la interfaz anterior y sin colores fijos en lo nuevo', () => {
  const css = read('css/documentos.css');
  for (const s of ['.dc-sort', '.dc-pill-select', '.dc-sel-btn', '.dc-mark', '.dc-row-actions', '.dc-foot', '.dc-btn-text']) assert.ok(!css.includes(s), `CSS sin usar: ${s}`);
  const rules = css.split('}').filter((r) => /\.dc-(filter|pill|details|detail-actions|selbar|row|danger-solid|confirm-del)/.test(r));
  assert.deepEqual(rules.filter((r) => /#[0-9a-f]{3,6}\b/i.test(r)), [], 'usa variables de app.css');
});
